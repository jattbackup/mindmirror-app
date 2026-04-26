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
  INSTALL_ID_KEY,
  TICK_MS,
  WRAP_SILENCE_STOP_MS,
} from '../_shared/constants'
import { appendEventLog } from '../_shared/log'
import { createMemory, type Memory, type SearchHit } from '../memory'
import type { Segment } from '../memory/schema'
import { createSttClient, type SttClient } from './audio/stt-client'
import { normalizeEvenHubEvent, routeInputEvent } from './input/events'
import { renderArmed, updateArmedText } from './render/armed'
import { renderCard, type CardModel } from './render/card'
import { renderHome } from './render/home'
import { renderRecall } from './render/recall'
import { truncate } from './render/format'
import { createG2Store, fullTranscript } from './state'
import { createTriggerEngine, type TriggerEvent } from './trigger'
import { vectorFromText } from '../memory/vectorIndex'

type Runtime = {
  bridge: EvenAppBridge | null
  memory: Memory | null
  stt: SttClient | null
  installId: string
  startupRendered: boolean
  unsubscribeEvents: (() => void) | null
  unsubscribeDevice: (() => void) | null
  tickTimer: number | null
  stopTimer: number | null
  renderQueue: Promise<void>
}

const store = createG2Store()
const trigger = createTriggerEngine()

const runtime: Runtime = {
  bridge: null,
  memory: null,
  stt: null,
  installId: '',
  startupRendered: false,
  unsubscribeEvents: null,
  unsubscribeDevice: null,
  tickTimer: null,
  stopTimer: null,
  renderQueue: Promise.resolve(),
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer))
  })
}

function enqueueRender(task: () => Promise<void>): Promise<void> {
  runtime.renderQueue = runtime.renderQueue.then(task, task)
  return runtime.renderQueue
}

async function ensureInstallId(bridge: EvenAppBridge): Promise<string> {
  const existing = await bridge.getLocalStorage(INSTALL_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID?.() ?? ulid()
  await bridge.setLocalStorage(INSTALL_ID_KEY, id)
  return id
}

function summariseLocally(event: TriggerEvent): CardModel {
  const state = store.getState()
  const transcript = fullTranscript(state)
  const tail = transcript.slice(-1200)
  const sentences = tail
    .split(/[.!?\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 12)
  const selected = sentences.slice(-CARD_MAX_BULLETS)
  const title =
    event.reason === 'closing_cue' ? 'Final actions'
    : event.reason === 'drift' ? 'Drift alert'
    : event.reason === 'manual' ? 'Marked moment'
    : 'Recap'

  const bullets = event.reason === 'drift'
    ? [`Bring the conversation back to: ${state.session.goal}`]
    : selected.length
      ? selected
      : ['Conversation is active; not enough new content yet.']

  return {
    kind: event.reason === 'closing_cue' ? 'actions' : event.reason === 'drift' ? 'drift' : 'recap',
    title,
    bullets,
    footerHint: event.reason === 'closing_cue' ? '● save session  ▼ end' : '▲ prev  ● save  ▼ dismiss',
    alignment: event.alignment,
    driftDirection: event.driftDirection,
    tickIndex: event.tickIndex,
    ts: event.surfaceAt,
  }
}

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
    triggerThatClosedIt: event.reason === 'closing_cue' ? 'closing_cue' : event.reason,
    summary: truncate(text, 500),
    bullets: card.bullets.slice(0, CARD_MAX_BULLETS),
    actionItems: event.reason === 'closing_cue' ? extractActionItems(card.bullets) : [],
    decisions: event.reason === 'closing_cue' ? card.bullets : [],
    embedding: vectorFromText(text),
    transcript,
  }
  await runtime.memory.appendSegment(segment)
}

function extractActionItems(bullets: string[]) {
  return bullets
    .filter((bullet) => /\b(send|review|draft|spec|decide|follow|ship|defer)\b/i.test(bullet))
    .slice(0, 5)
    .map((bullet) => ({ who: null, what: bullet, due: null }))
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

async function startListening(setStatus: SetStatus): Promise<void> {
  const bridge = runtime.bridge
  if (!bridge) {
    setStatus('Bridge not connected')
    return
  }
  const state = store.getState()
  const sessionId = state.session.id || ulid()
  store.setState({
    screen: 'armed',
    previousScreen: 'home',
    isRecording: true,
    finalTranscript: '',
    provisionalTranscript: '',
    session: {
      ...state.session,
      id: sessionId,
      startedAt: Date.now(),
    },
  })
  trigger.reset()
  trigger.setGoal(store.getState().session.goal)

  runtime.stt?.close()
  runtime.stt = createSttClient({
    backendUrl: DEFAULT_BACKEND_URL,
    installId: runtime.installId,
    onFinal(text) {
      store.setState((current) => ({ finalTranscript: current.finalTranscript + text, provisionalTranscript: '' }))
      trigger.onFinalTranscript(text)
      if (runtime.bridge && store.getState().screen === 'armed') void enqueueRender(() => updateArmedText(runtime.bridge!, store.getState()))
    },
    onProvisional(text) {
      store.setState({ provisionalTranscript: text })
      trigger.onProvisionalTranscript(text)
      if (runtime.bridge && store.getState().screen === 'armed') void enqueueRender(() => updateArmedText(runtime.bridge!, store.getState()))
    },
    onError(error) {
      appendEventLog(`STT error: ${error.message}`, 'warn')
      setStatus(`STT error: ${error.message}`)
    },
  })

  await enqueueRender(() => renderArmed(bridge, store.getState()))
  await bridge.audioControl(true)
  runtime.stt.connect().catch((error) => {
    appendEventLog(`STT connect failed: ${error instanceof Error ? error.message : String(error)}`, 'warn')
    setStatus('Recording locally; STT backend unavailable')
  })
  setStatus('Listening')
  appendEventLog('Listening started')
}

async function stopListening(finalise = false): Promise<void> {
  const bridge = runtime.bridge
  store.setState({ isRecording: false })
  runtime.stt?.close()
  runtime.stt = null
  if (bridge) await bridge.audioControl(false)
  if (finalise && runtime.memory && store.getState().session.id) {
    await runtime.memory.finaliseSession(store.getState().session.id, store.getState().currentCard?.title ?? null)
  }
  appendEventLog('Listening stopped')
}

function registerTriggerSubscription(setStatus: SetStatus): void {
  trigger.subscribe((event) => {
    const card = summariseLocally(event)
    void surfaceCard(card, event).then(async () => {
      if (event.reason === 'closing_cue') {
        setStatus('Wrap detected; finalising after silence')
        runtime.stopTimer = window.setTimeout(() => void stopListening(true), WRAP_SILENCE_STOP_MS)
      }
    })
  })
}

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
      startListening: () => startListening(setStatus),
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
      renderHome: async () => {
        if (runtime.bridge) await renderHome(runtime.bridge, store.getState().session.goal, 'rebuild')
      },
      renderArmed: async () => {
        if (runtime.bridge) await renderArmed(runtime.bridge, store.getState())
      },
      forceProbe: () => trigger.forceProbe(),
      cleanup: async () => {
        await stopListening(false)
        runtime.unsubscribeEvents?.()
        runtime.unsubscribeDevice?.()
        runtime.unsubscribeEvents = null
        runtime.unsubscribeDevice = null
      },
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
  window.addEventListener('mindmirror:setup', ((event: CustomEvent) => {
    const detail = event.detail as { goal?: string; participants?: string[]; timeboxMs?: number; passphrase?: string }
    const state = store.getState()
    store.setState({
      session: {
        ...state.session,
        goal: detail.goal || state.session.goal,
        participants: detail.participants ?? state.session.participants,
        timeboxMs: detail.timeboxMs ?? state.session.timeboxMs,
      },
    })
    trigger.setGoal(store.getState().session.goal)
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
  }) as EventListener)
}

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
  registerTriggerSubscription(setStatus)
  registerSetupEvents()

  return {
    async connect() {
      setStatus('Connecting to Even bridge...')
      try {
        runtime.bridge = await withTimeout(waitForEvenAppBridge(), 6000)
        runtime.installId = await ensureInstallId(runtime.bridge)
        runtime.memory = await createMemory({
          passphrase: '0000',
          backendUrl: DEFAULT_BACKEND_URL,
          bridge: runtime.bridge,
        })
        registerEvents(runtime.bridge, setStatus)
        await enqueueRender(() => renderHome(runtime.bridge!, store.getState().session.goal, 'create'))
        runtime.startupRendered = true
        runtime.tickTimer = window.setInterval(() => trigger.tick(), TICK_MS)
        setStatus('Connected. Tap glasses to start.')
      } catch (error) {
        setStatus('Bridge not found. Browser companion mode.')
        appendEventLog(`Bridge unavailable: ${error instanceof Error ? error.message : String(error)}`, 'warn')
        runtime.memory = await createMemory({ passphrase: '0000', backendUrl: DEFAULT_BACKEND_URL })
      }
    },
    async action() {
      if (store.getState().isRecording) {
        await stopListening(false)
      } else {
        await startListening(setStatus)
      }
    },
  }
}

window.addEventListener('beforeunload', () => {
  if (runtime.tickTimer) window.clearInterval(runtime.tickTimer)
  if (runtime.stopTimer) window.clearTimeout(runtime.stopTimer)
  runtime.stt?.close()
  void runtime.bridge?.audioControl(false)
  runtime.unsubscribeEvents?.()
  runtime.unsubscribeDevice?.()
})
