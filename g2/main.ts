import {
  waitForEvenAppBridge,
  type DeviceStatus,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { ulid } from 'ulid'
import type { AppActions, SetStatus } from '../_shared/app-types'
import {
  CARD_MAX_BULLETS,
  DEFAULT_BACKEND_URL,
  DRIFT_MUTE_MS,
  INSTALL_ID_KEY,
  TICK_MS,
  WRAP_SILENCE_STOP_MS,
} from '../_shared/constants'
import { appendEventLog } from '../_shared/log'
import { createMemory, type Memory, type SearchHit } from '../memory'
import type { Segment } from '../memory/schema'
import { createBrowserMic, type BrowserMic } from './audio/browser-mic'
import { createSttClient, type SttClient } from './audio/stt-client'
import { normalizeEvenHubEvent, routeInputEvent } from './input/events'
import { buildIntroFrames, MINDMIRROR_ASCII } from './intro/ascii'
import { renderArmed, updateArmedAlign, updateArmedText } from './render/armed'
import { renderCard, type CardModel } from './render/card'
import { renderHome } from './render/home'
import { rebuildIntro, renderIntroStartup, upgradeIntroFrame } from './render/intro'
import { renderRecall } from './render/recall'
import { truncate } from './render/format'
import { createG2Store, fullTranscript } from './state'
import { createTriggerEngine, type GoalContext, type TriggerEvent } from './trigger'
import { vectorFromText } from '../memory/vectorIndex'

type Runtime = {
  bridge: EvenAppBridge | null
  memory: Memory | null
  stt: SttClient | null
  browserMic: BrowserMic | null
  installId: string
  startupRendered: boolean
  unsubscribeEvents: (() => void) | null
  unsubscribeDevice: (() => void) | null
  unsubscribeSetup: (() => void) | null
  introTimer: number | null
  anchorTimer: number | null
  tickTimer: number | null
  stopTimer: number | null
  renderQueue: Promise<void>
  finalisedSessions: Set<string>
}

const store = createG2Store()
const trigger = createTriggerEngine()
const INTRO_FRAME_MS = 900

let lastSpeaker: number | null = null
let coachingActive = false
let setStatusRef: SetStatus = () => {}

const runtime: Runtime = {
  bridge: null,
  memory: null,
  stt: null,
  browserMic: null,
  installId: '',
  startupRendered: false,
  unsubscribeEvents: null,
  unsubscribeDevice: null,
  unsubscribeSetup: null,
  introTimer: null,
  anchorTimer: null,
  tickTimer: null,
  stopTimer: null,
  renderQueue: Promise.resolve(),
  finalisedSessions: new Set<string>(),
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(resolve).catch(reject).finally(() => window.clearTimeout(timer))
  })
}

function enqueueRender(task: () => Promise<void>): Promise<void> {
  runtime.renderQueue = runtime.renderQueue.then(task, task)
  return runtime.renderQueue
}

function clearIntroTimer(): void {
  if (runtime.introTimer) {
    window.clearInterval(runtime.introTimer)
    runtime.introTimer = null
  }
}

function clearSessionTimers(): void {
  if (runtime.anchorTimer) {
    window.clearTimeout(runtime.anchorTimer)
    runtime.anchorTimer = null
  }
  if (runtime.tickTimer) {
    window.clearInterval(runtime.tickTimer)
    runtime.tickTimer = null
  }
  if (runtime.stopTimer) {
    window.clearTimeout(runtime.stopTimer)
    runtime.stopTimer = null
  }
}

async function ensureInstallId(bridge: EvenAppBridge): Promise<string> {
  const existing = await bridge.getLocalStorage(INSTALL_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID?.() ?? ulid()
  await bridge.setLocalStorage(INSTALL_ID_KEY, id)
  return id
}

function speakerPrefix(speaker: number | undefined): string {
  if (speaker === undefined || lastSpeaker === speaker) return ''
  lastSpeaker = speaker
  return `\n[${speaker === 0 ? 'You' : 'Client'}]: `
}

function buildGoalContext(): GoalContext {
  const state = store.getState()
  return {
    sessionId: state.session.id || ulid(),
    goal: state.session.goal,
    goalEmbedding: new Float32Array(state.session.goalEmbedding),
    timeboxMs: state.session.timeboxMs,
    prospect: state.session.prospect,
    offer: state.session.offer,
    successCriteria: state.session.successCriteria,
    knownObjections: state.session.knownObjections,
    nextAsk: state.session.nextAsk,
  }
}

// ─── Intro lifecycle ─────────────────────────────────────────────────────────

async function transitionIntroToHome(setStatus: SetStatus): Promise<void> {
  if (store.getState().screen !== 'intro') return
  clearIntroTimer()
  const state = store.getState()
  store.setState({ screen: 'home', previousScreen: 'intro' })
  if (runtime.bridge) {
    await enqueueRender(() => renderHome(runtime.bridge!, state.session.goal, state.session.prospect, 'rebuild'))
  }
  await startPassive(setStatus)
}

async function startIntro(setStatus: SetStatus): Promise<void> {
  if (!runtime.bridge) return
  const frames = buildIntroFrames(MINDMIRROR_ASCII)
  const firstFrame = frames[0] ?? 'MindMirror'
  store.setState({ screen: 'intro', previousScreen: null })

  if (!runtime.startupRendered) {
    await enqueueRender(() => renderIntroStartup(runtime.bridge!, firstFrame))
    runtime.startupRendered = true
  } else {
    await enqueueRender(() => rebuildIntro(runtime.bridge!, firstFrame))
  }

  clearIntroTimer()
  let frameIndex = 0
  runtime.introTimer = window.setInterval(() => {
    frameIndex += 1
    if (frameIndex >= frames.length) {
      void transitionIntroToHome(setStatus)
      return
    }
    void enqueueRender(() => upgradeIntroFrame(runtime.bridge!, frames[frameIndex]))
  }, INTRO_FRAME_MS)
}

// ─── Drift card (LLM-powered) ───────────────────────────────────────────────

async function buildDriftCard(event: TriggerEvent): Promise<CardModel> {
  const state = store.getState()
  const transcript = fullTranscript(state)
  try {
    const response = await fetch(`${DEFAULT_BACKEND_URL}/llm/drift-coach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcriptTail: transcript.slice(-800), goal: state.session.goal }),
    })
    if (response.ok) {
      const data = await response.json() as { alert: string; strategy: string; bridgeScript: string }
      return {
        kind: 'drift',
        title: 'Diversion Alert',
        bullets: [data.alert],
        alert: data.alert,
        strategy: data.strategy,
        bridgeScript: data.bridgeScript,
        alignScore: event.alignScore ?? undefined,
        driftFromBaseline: event.driftFromBaseline ?? undefined,
        footerHint: '▼ dismiss  ● mute drift',
        tickIndex: event.tickIndex,
        ts: event.surfaceAt,
      }
    }
  } catch { /* fall through */ }
  return summariseLocally(event)
}

function summariseLocally(event: TriggerEvent): CardModel {
  const state = store.getState()
  const transcript = fullTranscript(state)
  const tail = transcript.slice(-1200)
  const sentences = tail.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 12)
  const selected = sentences.slice(-CARD_MAX_BULLETS)
  const title =
    event.reason === 'closing_cue' ? 'Final actions'
    : event.reason === 'drift_breach' ? 'Drift alert'
    : event.reason === 'manual_mark' ? 'Marked moment'
    : 'Recap'
  const bullets = event.reason === 'drift_breach'
    ? [`Bring the conversation back to: ${state.session.goal}`]
    : selected.length ? selected : ['Conversation active; not enough content yet.']
  return {
    kind: event.reason === 'closing_cue' ? 'actions' : event.reason === 'drift_breach' ? 'drift' : 'recap',
    title,
    bullets,
    alignScore: event.alignScore ?? undefined,
    driftFromBaseline: event.driftFromBaseline ?? undefined,
    footerHint: event.reason === 'closing_cue' ? '● save session  ▼ end' : '▲ prev  ● save  ▼ dismiss',
    tickIndex: event.tickIndex,
    ts: event.surfaceAt,
  }
}

// ─── Memory ──────────────────────────────────────────────────────────────────

async function appendCardSegment(card: CardModel, event: TriggerEvent): Promise<void> {
  const state = store.getState()
  if (!runtime.memory || !state.session.id) return
  const transcript = fullTranscript(state)
  const text = `${card.title} ${card.bullets.join(' ')}`
  const segment: Segment = {
    id: ulid(),
    sessionId: state.session.id,
    startedAt: Math.max(state.session.startedAt ?? event.surfaceAt, event.surfaceAt - TICK_MS),
    endedAt: event.surfaceAt,
    kind: card.kind === 'memory-hit' ? 'recap' : card.kind,
    triggerThatFiredIt: event.reason,
    summary: truncate(text, 500),
    bullets: card.bullets.slice(0, CARD_MAX_BULLETS),
    actionItems: event.reason === 'closing_cue' ? extractActionItems(card.bullets) : [],
    decisions: event.reason === 'closing_cue' ? card.bullets : [],
    embedding: vectorFromText(text),
    alignScore: event.alignScore,
    driftFromBaseline: event.driftFromBaseline,
    llmSteer: null,
    wasAccepted: null,
    transcript,
  }
  await runtime.memory.appendSegment(segment)
}

function extractActionItems(bullets: string[]) {
  return bullets
    .filter((b) => /\b(send|review|draft|spec|decide|follow|ship|defer)\b/i.test(b))
    .slice(0, 5)
    .map((b) => ({ who: null, what: b, due: null }))
}

async function surfaceCard(card: CardModel, event: TriggerEvent): Promise<void> {
  const prev = store.getState().screen
  store.setState((state) => ({
    screen: 'card',
    previousScreen: prev,
    currentCard: card,
    cardHistory: [...state.cardHistory, card],
    cardShownAt: Date.now(),
  }))
  await enqueueRender(async () => {
    if (runtime.bridge) await renderCard(runtime.bridge, card, 'rebuild')
  })
  await appendCardSegment(card, event)
}

// ─── Coaching activation ─────────────────────────────────────────────────────

async function activateCoaching(): Promise<void> {
  if (coachingActive) return
  coachingActive = true

  const bridge = runtime.bridge
  const state = store.getState()
  const sessionId = state.session.id || ulid()
  const prospect = state.session.prospect || 'Client'

  lastSpeaker = null
  store.setState({
    screen: 'armed',
    previousScreen: 'home',
    session: { ...state.session, id: sessionId, startedAt: Date.now() },
    finalTranscript: '',
    provisionalTranscript: '',
  })

  trigger.reset()
  trigger.onGoalSet(buildGoalContext())

  if (!runtime.tickTimer) {
    runtime.tickTimer = window.setInterval(() => trigger.tick(), TICK_MS)
  }

  // Show anchor card: goal + offer + next ask
  const anchorBullets = [
    truncate(state.session.goal, 58),
    state.session.offer ? `Offer: ${truncate(state.session.offer, 50)}` : null,
    state.session.nextAsk ? `Ask: ${truncate(state.session.nextAsk, 52)}` : null,
  ].filter((b): b is string => b !== null)

  const anchorTs = Date.now()
  const anchorCard: CardModel = {
    kind: 'recap',
    title: `Session — ${prospect}`,
    bullets: anchorBullets,
    footerHint: '● mark  ▼ dismiss',
    ts: anchorTs,
  }

  store.setState({
    screen: 'card',
    currentCard: anchorCard,
    cardHistory: [anchorCard],
    cardShownAt: anchorTs,
  })

  if (bridge) await enqueueRender(() => renderCard(bridge, anchorCard, 'rebuild'))

  setStatusRef(`Coaching: ${prospect}`)
  appendEventLog(`Coaching activated — ${prospect}`)

  // Auto-dismiss anchor after 8 seconds
  if (runtime.anchorTimer) window.clearTimeout(runtime.anchorTimer)
  runtime.anchorTimer = window.setTimeout(async () => {
    if (store.getState().currentCard?.ts === anchorTs) {
      store.setState({ screen: 'armed', currentCard: null, cardShownAt: null })
      if (bridge) await renderArmed(bridge, store.getState())
    }
    runtime.anchorTimer = null
  }, 8000)
}

// ─── Audio / STT ─────────────────────────────────────────────────────────────

function onFinalText(text: string, speaker?: number): void {
  if (!coachingActive) {
    void activateCoaching()
  }
  const prefix = speakerPrefix(speaker)
  const labeled = prefix + text
  store.setState((current) => ({ finalTranscript: current.finalTranscript + labeled, provisionalTranscript: '' }))
  trigger.onFinalTranscript(labeled)
  if (runtime.bridge && store.getState().screen === 'armed') {
    void enqueueRender(() => updateArmedText(runtime.bridge!, store.getState()))
  }
}

function onProvisionalText(text: string): void {
  if (!coachingActive) {
    void activateCoaching()
  }
  store.setState({ provisionalTranscript: text })
  trigger.onProvisionalTranscript(text)
  if (runtime.bridge && store.getState().screen === 'armed') {
    void enqueueRender(() => updateArmedText(runtime.bridge!, store.getState()))
  }
}

async function startPassive(setStatus: SetStatus): Promise<void> {
  if (store.getState().isRecording) return
  setStatusRef = setStatus
  coachingActive = false
  lastSpeaker = null

  const bridge = runtime.bridge
  const prospect = store.getState().session.prospect || 'client'

  store.setState({ isRecording: true, finalTranscript: '', provisionalTranscript: '' })

  runtime.stt?.close()
  runtime.stt = createSttClient({
    backendUrl: DEFAULT_BACKEND_URL,
    installId: runtime.installId,
    onFinal: onFinalText,
    onProvisional: onProvisionalText,
    onError(error) {
      appendEventLog(`STT error: ${error.message}`, 'warn')
      setStatus(`STT error: ${error.message}`)
    },
  })

  if (bridge) {
    await bridge.audioControl(true)
  } else {
    runtime.browserMic = createBrowserMic({
      onAudio(pcm) {
        trigger.onAudioFrame(pcm)
        runtime.stt?.sendAudio(pcm)
      },
      onError(error) {
        appendEventLog(`Mic error: ${error.message}`, 'warn')
        setStatus(`Mic error: ${error.message}`)
      },
    })
    await runtime.browserMic.start()
  }

  runtime.stt.connect().catch((error) => {
    appendEventLog(`STT connect failed: ${error instanceof Error ? error.message : String(error)}`, 'warn')
    setStatus('Mic active; STT backend unavailable')
  })

  setStatus(`Say "${prospect}" to begin`)
  appendEventLog('Passive listening started')
}

async function stopListening(finalise = false): Promise<void> {
  const bridge = runtime.bridge
  coachingActive = false
  store.setState({ isRecording: false })
  runtime.stt?.close()
  runtime.stt = null
  runtime.browserMic?.stop()
  runtime.browserMic = null
  if (bridge) await bridge.audioControl(false)
  clearSessionTimers()
  if (finalise && runtime.memory && store.getState().session.id) {
    const s = store.getState()
    if (!runtime.finalisedSessions.has(s.session.id)) {
      runtime.finalisedSessions.add(s.session.id)
      await runtime.memory.finaliseSession(s.session.id, {
        title: s.currentCard?.title ?? null,
        finalAlign: s.session.finalAlign,
        outcome: 'completed',
      })
    }
  }
  appendEventLog('Listening stopped')
}

async function cleanupRuntime(finalise = false): Promise<void> {
  clearIntroTimer()
  await stopListening(finalise)
  runtime.unsubscribeEvents?.()
  runtime.unsubscribeDevice?.()
  runtime.unsubscribeSetup?.()
  runtime.unsubscribeEvents = null
  runtime.unsubscribeDevice = null
  runtime.unsubscribeSetup = null
}

// ─── Trigger subscription ────────────────────────────────────────────────────

function registerTriggerSubscription(setStatus: SetStatus): void {
  trigger.subscribe((event) => {
    if (event.alignScore !== null) {
      store.setState({ lastAlignScore: event.alignScore })
      if (runtime.bridge && store.getState().screen === 'armed') {
        void enqueueRender(() => updateArmedAlign(runtime.bridge!, store.getState()))
      }
    }
    if (event.kind === 'heartbeat') return
    void (async () => {
      const card = event.reason === 'drift_breach'
        ? await buildDriftCard(event)
        : summariseLocally(event)
      await surfaceCard(card, event)
      if (event.reason === 'closing_cue') {
        setStatus('Wrap detected; finalising after silence')
        if (runtime.stopTimer) window.clearTimeout(runtime.stopTimer)
        runtime.stopTimer = window.setTimeout(() => void stopListening(true), WRAP_SILENCE_STOP_MS)
      }
    })()
  })
}

// ─── Bridge events ───────────────────────────────────────────────────────────

function registerEvents(bridge: EvenAppBridge, setStatus: SetStatus): void {
  if (runtime.unsubscribeEvents) return
  runtime.unsubscribeEvents = bridge.onEvenHubEvent((raw) => {
    const event = normalizeEvenHubEvent(raw)
    if (event.kind === 'audio') {
      trigger.onAudioFrame(event.pcm)
      runtime.stt?.sendAudio(event.pcm)
      return
    }
    if (event.kind === 'abnormal_exit') trigger.noteAbnormalExit()
    void routeInputEvent(bridge, store, event, {
      skipIntro: () => transitionIntroToHome(setStatus),
      startListening: () => activateCoaching(),
      stopListening,
      showPreviousCard: async () => {
        const history = store.getState().cardHistory
        const card = history[Math.max(0, history.length - 2)]
        if (card && runtime.bridge) await renderCard(runtime.bridge, card, 'upgrade')
      },
      dismissCard: async () => {
        store.setState({ screen: 'armed', currentCard: null, cardShownAt: null })
        if (runtime.bridge) await renderArmed(runtime.bridge, store.getState())
      },
      saveCard: async () => {
        store.setState({ screen: 'armed', currentCard: null, cardShownAt: null })
        if (runtime.bridge) await renderArmed(runtime.bridge, store.getState())
      },
      muteDrift: () => trigger.muteDrift(DRIFT_MUTE_MS),
      renderHome: async () => {
        if (runtime.bridge) await renderHome(runtime.bridge, store.getState().session.goal, store.getState().session.prospect, 'rebuild')
      },
      renderArmed: async () => {
        if (runtime.bridge) await renderArmed(runtime.bridge, store.getState())
      },
      forceMark: () => trigger.forceMark(),
      cleanup: () => cleanupRuntime(false),
    }).catch((error) => {
      appendEventLog(`Input route failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
    })
  })

  runtime.unsubscribeDevice = bridge.onDeviceStatusChanged((status: DeviceStatus) => {
    store.setState({
      isWearing: status.isWearing ?? store.getState().isWearing,
      batteryLevel: status.batteryLevel ?? store.getState().batteryLevel,
    })
    trigger.onWearingChanged(status.isWearing ?? true)
  })
}

function registerSetupEvents(): void {
  if (runtime.unsubscribeSetup) return
  const listener = ((event: CustomEvent) => {
    const detail = event.detail as { goal?: string; participants?: string[]; timeboxMs?: number; passphrase?: string; prospect?: string; offer?: string; nextAsk?: string }
    const state = store.getState()
    store.setState({
      session: {
        ...state.session,
        goal: detail.goal || state.session.goal,
        participants: detail.participants ?? state.session.participants,
        timeboxMs: detail.timeboxMs ?? state.session.timeboxMs,
        prospect: detail.prospect ?? state.session.prospect,
        offer: detail.offer ?? state.session.offer,
        nextAsk: detail.nextAsk ?? state.session.nextAsk,
      },
    })
    if (detail.passphrase) {
      void createMemory({
        passphrase: detail.passphrase,
        backendUrl: DEFAULT_BACKEND_URL,
        bridge: runtime.bridge ?? undefined,
      }).then((memory) => {
        runtime.memory = memory
      }).catch((error) => {
        appendEventLog(`Memory unlock failed: ${error instanceof Error ? error.message : String(error)}`, 'warn')
      })
    }
    // Update home screen if visible
    if (runtime.bridge && store.getState().screen === 'home') {
      const s = store.getState()
      void enqueueRender(() => renderHome(runtime.bridge!, s.session.goal, s.session.prospect, 'rebuild'))
    }
    setStatusRef(`Say "${store.getState().session.prospect || 'client'}" to begin`)
  }) as EventListener
  window.addEventListener('mindmirror:setup', listener)
  runtime.unsubscribeSetup = () => window.removeEventListener('mindmirror:setup', listener)
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export function getMindMirrorStore() {
  return store
}

export function getMindMirrorMemory() {
  return runtime.memory
}

export function pushRecallToGlasses(hits: SearchHit[]): void {
  const top = hits[0]
  if (top) {
    store.setState({
      screen: 'recall',
      previousScreen: store.getState().screen,
      currentCard: {
        kind: 'memory-hit',
        title: 'Memory hit',
        bullets: [top.snippet],
        footerHint: '● save  ▼ back',
        ts: top.ts,
      },
    })
  }
  if (runtime.bridge) void enqueueRender(() => renderRecall(runtime.bridge!, hits))
}

export function createMindMirrorActions(setStatus: SetStatus): AppActions {
  setStatusRef = setStatus
  registerTriggerSubscription(setStatus)
  registerSetupEvents()

  return {
    async connect() {
      setStatus('Connecting...')
      try {
        runtime.bridge = await withTimeout(waitForEvenAppBridge(), 6000)
        runtime.installId = await ensureInstallId(runtime.bridge)
        runtime.memory = await createMemory({ passphrase: '0000', backendUrl: DEFAULT_BACKEND_URL, bridge: runtime.bridge })
        registerEvents(runtime.bridge, setStatus)
        await startIntro(setStatus)
      } catch (error) {
        appendEventLog(`Bridge unavailable: ${error instanceof Error ? error.message : String(error)}`, 'warn')
        runtime.memory = await createMemory({ passphrase: '0000', backendUrl: DEFAULT_BACKEND_URL })
        store.setState({ screen: 'home', previousScreen: 'intro' })
        await startPassive(setStatus)
      }
    },
    async action() {
      const state = store.getState()
      if (state.screen === 'intro') {
        await transitionIntroToHome(setStatus)
      } else if (!state.isRecording) {
        await startPassive(setStatus)
      } else if (!coachingActive) {
        // Manual coaching start (bypasses name trigger)
        await activateCoaching()
      } else {
        await stopListening(false)
      }
    },
  }
}

window.addEventListener('beforeunload', () => {
  void cleanupRuntime(false)
})
