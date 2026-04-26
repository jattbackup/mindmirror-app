import {
  COOLDOWN_MS,
  DEFAULT_BACKEND_URL,
  MIN_CONTENT_TOKENS,
  TICK_MS,
  TRANSCRIPT_TAIL_CHARS,
} from '../../_shared/constants'
import { createVad } from '../audio/vad'
import { canSurface } from './cooldown'
import { closingCueDetector } from './detectors/closingCue'
import { discourseShiftDetector } from './detectors/discourseShift'
import { createEmbeddingNoveltyDetector } from './detectors/embeddingNovelty'
import { createGoalAlignmentScorer, type GoalAlignmentResult } from './detectors/goalAlignment'
import { createMotionProxyDetector } from './detectors/motionProxy'
import { silenceDetector } from './detectors/silence'
import type { Detector, DetectorContext, DetectorOutput } from './detectors/_iface'
import { fuse } from './fusion'

export type Phase = 'warmup' | 'align' | 'drift' | 'wrap'
export type SurfaceKind = 'recap' | 'drift' | 'actions' | 'heartbeat'
export type TriggerReason =
  | 'tick'
  | 'closing_cue'
  | 'topic_shift'
  | 'silence'
  | 'motion'
  | 'manual_mark'
  | 'drift_breach'

export type TriggerEvent = {
  phase: Phase
  reason: TriggerReason
  kind: SurfaceKind
  alignScore: number | null
  driftFromBaseline: number | null
  surfaceAt: number
  tickIndex: number
  baseline?: number | null
  pulledForward?: boolean
}

export type GoalContext = {
  sessionId: string
  goal: string
  goalEmbedding: Float32Array
  timeboxMs: number
  prospect?: string
  offer?: string
  successCriteria?: string[]
  knownObjections?: string[]
  nextAsk?: string
}

export type TriggerEngine = {
  onAudioFrame(pcm: Uint8Array): void
  onFinalTranscript(text: string): void
  onProvisionalTranscript(text: string): void
  onWearingChanged(isWearing: boolean): void
  onGoalSet(goal: GoalContext): void
  subscribe(cb: (e: TriggerEvent) => void): () => void
  forceMark(): void
  muteDrift(durationMs: number): void
  reset(): void
  tick(): void
  noteAbnormalExit(): void
}

function tokenCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function reasonFromDetector(reason: DetectorOutput['reason']): TriggerReason | null {
  if (!reason) return null
  return reason
}

export function createTriggerEngine(opts: { now?: () => number; backendUrl?: string } = {}): TriggerEngine {
  const now = opts.now ?? (() => Date.now())
  const backendUrl = opts.backendUrl ?? DEFAULT_BACKEND_URL
  void backendUrl

  const vad = createVad()
  const motion = createMotionProxyDetector()
  const goalAlignment = createGoalAlignmentScorer()
  const detectors: Detector[] = [
    closingCueDetector,
    discourseShiftDetector,
    silenceDetector,
    motion,
    createEmbeddingNoveltyDetector(),
  ]
  const subscribers = new Set<(e: TriggerEvent) => void>()

  let finalTranscript = ''
  let provisional = ''
  let isWearing = true
  let startedAt = now()
  let lastTickAt = startedAt
  let lastSurfaceAt = 0
  let lastReason: TriggerReason | null = null
  let lastSurfaceTokenCount = 0
  let tickIndex = 0
  let forceNextTick: TriggerReason | null = null
  let goal: GoalContext | null = null
  let wrapEmitted = false

  const emit = (event: TriggerEvent, visible: boolean) => {
    if (visible) {
      lastSurfaceAt = event.surfaceAt
      lastReason = event.reason
      lastSurfaceTokenCount = tokenCount(finalTranscript)
    }
    subscribers.forEach((cb) => cb(event))
  }

  const context = (): DetectorContext => ({
    now: now(),
    silenceMs: vad.getState().silenceMs,
    finalTail: finalTranscript.slice(-TRANSCRIPT_TAIL_CHARS),
    provisional,
    isWearing,
    sinceLastSurfaceMs: lastSurfaceAt ? now() - lastSurfaceAt : Number.POSITIVE_INFINITY,
  })

  const phaseFor = (alignment: GoalAlignmentResult, reason: TriggerReason): Phase => {
    if (reason === 'closing_cue') return 'wrap'
    if (reason === 'drift_breach') return 'drift'
    return alignment.alignScore === null ? 'warmup' : 'align'
  }

  const makeEvent = (args: {
    reason: TriggerReason
    kind: SurfaceKind
    alignment: GoalAlignmentResult
    pulledForward?: boolean
  }): TriggerEvent => ({
    phase: phaseFor(args.alignment, args.reason),
    reason: args.reason,
    kind: args.kind,
    alignScore: args.alignment.alignScore,
    driftFromBaseline: args.alignment.driftFromBaseline,
    baseline: args.alignment.baseline,
    surfaceAt: now(),
    tickIndex,
    pulledForward: args.pulledForward,
  })

  const maybeVisible = (event: TriggerEvent): boolean => {
    if (!isWearing) return false
    if (event.kind === 'actions' || event.kind === 'drift') return true
    return canSurface({
      now: event.surfaceAt,
      lastSurfaceAt,
      lastReason,
      nextReason: event.reason,
      cooldownMs: COOLDOWN_MS,
    })
  }

  const surfaceClosingCue = () => {
    if (wrapEmitted) return
    if (now() - startedAt < TICK_MS) return
    const alignment = goalAlignment.score(finalTranscript.slice(-1200), now() - startedAt, now())
    const event = makeEvent({ reason: 'closing_cue', kind: 'actions', alignment, pulledForward: true })
    wrapEmitted = true
    emit(event, true)
  }

  const runDetectors = () => {
    if (!goal) return
    const ctx = context()
    const outputs = detectors
      .map((detector) => detector.run(ctx))
      .filter((output): output is DetectorOutput => !(output instanceof Promise))
    const fused = fuse(outputs)
    const reason = reasonFromDetector(fused?.reason ?? null)
    if (!reason) return
    if (reason === 'closing_cue') {
      surfaceClosingCue()
      return
    }
    forceNextTick = reason
    if (now() - lastTickAt > 2_000) tick(true, reason)
  }

  const tick = (pulledForward = false, reason: TriggerReason = 'tick') => {
    if (!goal) return
    const at = now()
    if (!pulledForward && at - lastTickAt < TICK_MS) return
    lastTickAt = at
    tickIndex += 1

    const tokensSince = tokenCount(finalTranscript) - lastSurfaceTokenCount
    const tail = finalTranscript.slice(-1200)
    const alignment = goalAlignment.score(tail, at - startedAt, at)
    const thin = tokensSince < MIN_CONTENT_TOKENS && reason !== 'manual_mark'

    if (thin) {
      emit(makeEvent({ reason: 'tick', kind: 'heartbeat', alignment, pulledForward }), false)
      forceNextTick = null
      return
    }

    if (alignment.lowAlignSustained && alignment.alignScore !== null && alignment.alignScore < 0.55 && reason === 'tick') {
      forceNextTick = 'topic_shift'
    }

    if (alignment.driftBreached) {
      const driftEvent = makeEvent({
        reason: 'drift_breach',
        kind: 'drift',
        alignment,
        pulledForward: true,
      })
      emit(driftEvent, true)
      forceNextTick = null
      return
    }

    const event = makeEvent({
      reason,
      kind: 'recap',
      alignment,
      pulledForward,
    })
    if (maybeVisible(event)) emit(event, true)
    forceNextTick = null
  }

  return {
    onAudioFrame(pcm) {
      vad.push(pcm)
      runDetectors()
    },
    onFinalTranscript(text) {
      finalTranscript += text.startsWith(' ') ? text : ` ${text}`
      runDetectors()
    },
    onProvisionalTranscript(text) {
      provisional = text
    },
    onWearingChanged(next) {
      isWearing = next
    },
    onGoalSet(nextGoal) {
      goal = nextGoal
      startedAt = now()
      lastTickAt = startedAt
      lastSurfaceAt = 0
      lastReason = null
      lastSurfaceTokenCount = tokenCount(finalTranscript)
      tickIndex = 0
      forceNextTick = null
      goalAlignment.setGoal(nextGoal)
      wrapEmitted = false
    },
    subscribe(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    forceMark() {
      forceNextTick = 'manual_mark'
      tick(true, 'manual_mark')
    },
    muteDrift(durationMs) {
      goalAlignment.muteDrift(now() + durationMs)
    },
    reset() {
      finalTranscript = ''
      provisional = ''
      vad.reset()
      startedAt = now()
      lastTickAt = startedAt
      lastSurfaceAt = 0
      lastReason = null
      lastSurfaceTokenCount = 0
      tickIndex = 0
      forceNextTick = null
      goal = null
      wrapEmitted = false
      goalAlignment.reset()
    },
    tick() {
      tick(false, forceNextTick ?? 'tick')
    },
    noteAbnormalExit() {
      motion.noteAbnormalExit()
    },
  }
}
