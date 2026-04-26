import {
  ALIGN_AFTER_MS,
  ALIGN_BASELINE_TICKS,
  MIN_CONTENT_TOKENS,
  TICK_MS,
  TRANSCRIPT_TAIL_CHARS,
} from '../../_shared/constants'
import { createVad } from '../audio/vad'
import { canSurface } from './cooldown'
import { closingCueDetector } from './detectors/closingCue'
import { discourseShiftDetector } from './detectors/discourseShift'
import { createEmbeddingNoveltyDetector, cosine, lexicalVector } from './detectors/embeddingNovelty'
import { createMotionProxyDetector } from './detectors/motionProxy'
import { silenceDetector } from './detectors/silence'
import type { Detector, DetectorContext, DetectorOutput } from './detectors/_iface'
import { alignmentDirection, driftBreached, fuse } from './fusion'

export type Phase = 'mid' | 'topic_end' | 'wrap'

export type TriggerEvent = {
  phase: Phase
  reason: 'closing_cue' | 'topic_shift' | 'silence' | 'motion' | 'periodic' | 'drift' | 'manual'
  score: number
  surfaceAt: number
  alignment?: number
  driftDirection?: 'up' | 'down' | 'flat'
  tickIndex?: number
  pulledForward?: boolean
}

export type TriggerEngine = {
  onAudioFrame(pcm: Uint8Array): void
  onFinalTranscript(text: string): void
  onProvisionalTranscript(text: string): void
  onWearingChanged(isWearing: boolean): void
  subscribe(cb: (e: TriggerEvent) => void): () => void
  forceProbe(): void
  reset(): void
  tick(): void
  setGoal(goal: string): void
  noteAbnormalExit(): void
}

function tokenCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function createTriggerEngine(opts: { now?: () => number; goal?: string } = {}): TriggerEngine {
  const now = opts.now ?? (() => Date.now())
  const vad = createVad()
  const motion = createMotionProxyDetector()
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
  let lastReason: TriggerEvent['reason'] | null = null
  let lastSurfaceTokenCount = 0
  let tickIndex = 0
  let goal = opts.goal ?? 'Decide next steps and owners.'
  let alignSamples: number[] = []
  let baseline: number | null = null
  let forceNextTick = false

  const emit = (event: TriggerEvent) => {
    lastSurfaceAt = event.surfaceAt
    lastReason = event.reason
    lastSurfaceTokenCount = tokenCount(finalTranscript)
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

  const scoreAlignment = (): number | undefined => {
    if (now() - startedAt < ALIGN_AFTER_MS) return undefined
    const tail = finalTranscript.slice(-1200)
    if (tokenCount(tail) < 12) return undefined
    const score = Math.max(0, Math.min(1, cosine(lexicalVector(goal), lexicalVector(tail))))
    alignSamples.push(score)
    if (alignSamples.length > ALIGN_BASELINE_TICKS && baseline === null) {
      const first = alignSamples.slice(0, ALIGN_BASELINE_TICKS)
      baseline = first.reduce((sum, n) => sum + n, 0) / first.length
    }
    return score
  }

  const maybeSurface = (event: Omit<TriggerEvent, 'surfaceAt'>): void => {
    const at = now()
    const tokensSince = tokenCount(finalTranscript) - lastSurfaceTokenCount
    if (!isWearing) return
    if (event.reason !== 'closing_cue' && tokensSince < MIN_CONTENT_TOKENS && !forceNextTick) return
    if (!canSurface({ now: at, lastSurfaceAt, lastReason, nextReason: event.reason })) return
    forceNextTick = false
    emit({ ...event, surfaceAt: at })
  }

  const runDetectors = () => {
    const ctx = context()
    const outputs = detectors
      .map((detector) => detector.run(ctx))
      .filter((o): o is DetectorOutput => !(o instanceof Promise))
    const fused = fuse(outputs)
    if (!fused) return
    if (fused.reason === 'closing_cue') {
      maybeSurface({ ...fused, score: Math.max(0.9, fused.score) })
    } else {
      forceNextTick = true
      if (now() - lastTickAt > 2_000) tick(true, fused.reason)
    }
  }

  const tick = (pulledForward = false, reason: TriggerEvent['reason'] = 'periodic') => {
    const at = now()
    if (!pulledForward && at - lastTickAt < TICK_MS) return
    lastTickAt = at
    tickIndex += 1
    const alignment = scoreAlignment()
    const driftDirection = typeof alignment === 'number' ? alignmentDirection(alignment, baseline) : undefined

    if (typeof alignment === 'number' && driftBreached(alignment, baseline)) {
      maybeSurface({
        phase: 'mid',
        reason: 'drift',
        score: 0.85,
        alignment,
        driftDirection,
        tickIndex,
        pulledForward,
      })
      return
    }

    maybeSurface({
      phase: reason === 'periodic' ? 'mid' : 'topic_end',
      reason,
      score: reason === 'periodic' ? 0.55 : 0.65,
      alignment,
      driftDirection,
      tickIndex,
      pulledForward,
    })
  }

  return {
    onAudioFrame(pcm) {
      vad.push(pcm)
      runDetectors()
    },
    onFinalTranscript(text) {
      finalTranscript += text
      runDetectors()
    },
    onProvisionalTranscript(text) {
      provisional = text
    },
    onWearingChanged(next) {
      isWearing = next
    },
    subscribe(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    forceProbe() {
      forceNextTick = true
      tick(true, 'manual')
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
      alignSamples = []
      baseline = null
      forceNextTick = false
    },
    tick() {
      tick(false, 'periodic')
    },
    setGoal(nextGoal) {
      goal = nextGoal || goal
    },
    noteAbnormalExit() {
      motion.noteAbnormalExit()
    },
  }
}
