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
  DEFAULT_SALES_GOAL,
  DEFAULT_SALES_NEXT_ASK,
  DEFAULT_SALES_OFFER,
  DEFAULT_SALES_PROSPECT,
  DRIFT_MUTE_MS,
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
import { renderFinalising } from './render/finalising'
import { renderHome } from './render/home'
import { renderOnboarding } from './render/onboarding'
import { renderRecall } from './render/recall'
import { truncate } from './render/format'
import { startSession, type SessionHandle } from './session/lifecycle'
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
  sessionHandle: SessionHandle | null
}

const store = createG2Store()
const trigger = createTriggerEngine({ backendUrl: DEFAULT_BACKEND_URL })

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
  sessionHandle: null,
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
    event.kind === 'actions' ? 'Close actions'
    : event.kind === 'drift' ? 'Drift alert'
    : event.reason === 'manual_mark' ? 'Marked moment'
    : event.phase === 'warmup' ? 'Sales warmup'
    : 'Toward close'

  const bullets = event.kind === 'drift'
    ? [`Last exchange moved away from ${state.session.goal}`]
    : selected.length
      ? selected
      : [`Toward close: ${state.session.nextAsk}`]

  return {
    kind: event.kind === 'actions' ? 'actions' : event.kind === 'drift' ? 'drift' : 'recap',
    title,
    bullets,
    steer: event.kind === 'drift' ? `Let's return to ${truncate(state.session.nextAsk || state.session.goal, 64)}.` : undefined,
    footerHint: event.kind === 'actions'
      ? '● save session  ▼ end'
      : event.kind === 'drift'
        ? '▲ ignore  ● accept  ▼ mute drift'
        : '▲ prev  ● mark  ▼ dismiss',
    alignScore: event.alignScore ?? undefined,
    driftFromBaseline: event.driftFromBaseline ?? undefined,
    tickIndex: event.tickIndex,
    elapsedMs: event.surfaceAt - (state.session.startedAt ?? event.surfaceAt),
    timeboxMs: state.session.timeboxMs,
    ts: event.surfaceAt,
  }
}

async function summariseForEvent(event: TriggerEvent): Promise<CardModel> {
  const fallback = summariseLocally(event)
  if (event.kind === 'heartbeat') return fallback
  const state = store.getState()
  const priorSummaries = state.cardHistory.flatMap((card) => card.bullets).slice(-12)
  try {
    const response = await fetch(`${DEFAULT_BACKEND_URL.replace(/\/$/, '')}/llm/summarise`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mm-install-id': runtime.installId,
      },
      body: JSON.stringify({
        transcriptTail: fullTranscript(state).slice(-8_000),
        phase: event.phase,
        goal: [
          state.session.goal,
          state.session.successCriteria.join(' '),
          state.session.knownObjections.join(' '),
          state.session.nextAsk,
        ].filter(Boolean).join(' '),
        priorSummaries,
        alignScore: event.alignScore,
        driftFromBaseline: event.driftFromBaseline,
        style: event.kind === 'actions' ? 'actions' : event.kind === 'drift' ? 'drift' : 'recap',
      }),
    })
    if (!response.ok) return fallback
    const json = await response.json() as {
      title?: string
      bullets?: string[]
      steer?: string | null
    }
    return {
      ...fallback,
      title: truncate(json.title ?? fallback.title, 60),
      bullets: (json.bullets?.length ? json.bullets : fallback.bullets).slice(0, CARD_MAX_BULLETS),
      steer: json.steer ?? fallback.steer,
    }
  } catch {
    return fallback
  }
}

async function appendCardSegment(card: CardModel, event: TriggerEvent): Promise<string | null> {
  const state = store.getState()
  if (!runtime.memory || !state.session.id) return null
  const transcript = fullTranscript(state)
  const text = `${card.title} ${card.bullets.join(' ')} ${card.steer ?? ''}`
  const segmentId = card.segmentId ?? ulid()
  const segment: Segment = {
    id: segmentId,
    sessionId: state.session.id,
    startedAt: Math.max(state.session.startedAt ?? event.surfaceAt, event.surfaceAt - TICK_MS),
    endedAt: event.surfaceAt,
    kind: event.kind,
    triggerThatFiredIt: event.reason,
    summary: truncate(text, 500),
    bullets: card.bullets.slice(0, CARD_MAX_BULLETS),
    actionItems: event.kind === 'actions' ? extractActionItems(card.bullets) : [],
    decisions: event.kind === 'actions' ? card.bullets : [],
    embedding: vectorFromText(text),
    alignScore: event.alignScore,
    driftFromBaseline: event.driftFromBaseline,
    llmSteer: card.steer ?? null,
    wasAccepted: event.kind === 'drift' ? false : null,
    transcript,
  }
  await runtime.memory.appendSegment(segment)
  return segmentId
}

function extractActionItems(bullets: string[]) {
  return bullets
    .filter((bullet) => /\b(send|review|draft|spec|decide|follow|ship|defer)\b/i.test(bullet))
    .slice(0, 5)
    .map((bullet) => ({ who: null, what: bullet, due: null }))
}

async function appendHeartbeat(event: TriggerEvent): Promise<void> {
  const state = store.getState()
  if (!runtime.memory || !state.session.id) return
  await runtime.memory.appendSegment({
    id: ulid(),
    sessionId: state.session.id,
    startedAt: event.surfaceAt,
    endedAt: event.surfaceAt,
    kind: 'heartbeat',
    triggerThatFiredIt: 'tick',
    summary: '',
    bullets: [],
    actionItems: [],
    decisions: [],
    embedding: [],
    alignScore: event.alignScore,
    driftFromBaseline: event.driftFromBaseline,
    llmSteer: null,
    wasAccepted: null,
  })
}

async function surfaceCard(card: CardModel, event: TriggerEvent): Promise<void> {
  const prev = store.getState().screen
  const segmentId = await appendCardSegment(card, event)
  const nextCard = segmentId ? { ...card, segmentId } : card
  store.setState((state) => ({
    screen: 'card',
    previousScreen: prev,
    currentCard: nextCard,
    cardHistory: [...state.cardHistory, nextCard],
    cardShownAt: Date.now(),
  }))
  await enqueueRender(async () => {
    if (runtime.bridge) await renderCard(runtime.bridge, nextCard, 'rebuild')
  })
}

type SalesOnboardingDetail = {
  prospect?: string
  participants?: string[]
  offer?: string
  goal?: string
  successCriteria?: string[]
  knownObjections?: string[]
  nextAsk?: string
  timeboxMs?: number
  passphrase?: string
}

async function prepareSalesOnboarding(detail: SalesOnboardingDetail, setStatus?: SetStatus): Promise<void> {
  const state = store.getState()
  const session = {
    ...state.session,
    prospect: detail.prospect || state.session.prospect || DEFAULT_SALES_PROSPECT,
    participants: detail.participants ?? state.session.participants,
    offer: detail.offer || state.session.offer || DEFAULT_SALES_OFFER,
    goal: detail.goal || state.session.goal || DEFAULT_SALES_GOAL,
    successCriteria: detail.successCriteria ?? state.session.successCriteria,
    knownObjections: detail.knownObjections ?? state.session.knownObjections,
    nextAsk: detail.nextAsk || state.session.nextAsk || DEFAULT_SALES_NEXT_ASK,
    timeboxMs: detail.timeboxMs ?? state.session.timeboxMs,
  }

  store.setState({ session, onboardingReady: true })

  if (detail.passphrase) {
    runtime.memory = await createMemory({
      passphrase: detail.passphrase,
      backendUrl: DEFAULT_BACKEND_URL,
      bridge: runtime.bridge ?? undefined,
    })
  }

  try {
    runtime.sessionHandle = await startSession({
      goal: session.goal,
      participants: session.participants,
      timeboxMs: session.timeboxMs,
      prospect: session.prospect,
      offer: session.offer,
      successCriteria: session.successCriteria,
      knownObjections: session.knownObjections,
      nextAsk: session.nextAsk,
    }, { backendUrl: DEFAULT_BACKEND_URL })
    store.setState((current) => ({
      session: {
        ...current.session,
        id: runtime.sessionHandle!.sessionId,
        startedAt: runtime.sessionHandle!.startedAt,
        goalEmbedding: Array.from(runtime.sessionHandle!.goalEmbedding),
      },
    }))
    if (runtime.memory) {
      await runtime.memory.startSession({
        sessionId: runtime.sessionHandle.sessionId,
        goal: session.goal,
        goalEmbedding: runtime.sessionHandle.goalEmbedding,
        participants: session.participants,
        timeboxMs: session.timeboxMs,
        startedAt: runtime.sessionHandle.startedAt,
        prospect: session.prospect,
        offer: session.offer,
        successCriteria: session.successCriteria,
        knownObjections: session.knownObjections,
        nextAsk: session.nextAsk,
      })
    }
    setStatus?.('Sales goal ready. Tap glasses to confirm.')
  } catch (error) {
    appendEventLog(`Onboarding failed: ${error instanceof Error ? error.message : String(error)}`, 'warn')
    setStatus?.('Sales goal saved; embedding fallback will run on start.')
  }

  if (runtime.bridge) {
    await enqueueRender(() => renderHome(runtime.bridge!, store.getState().session.goal, 'rebuild', true))
  }
}

async function showOnboardingConfirm(setStatus: SetStatus): Promise<void> {
  const bridge = runtime.bridge
  if (!bridge) {
    setStatus('Bridge not connected')
    return
  }
  const state = store.getState()
  if (!state.onboardingReady) {
    setStatus('Open Onboarding in companion first')
    await enqueueRender(() => renderHome(bridge, state.session.goal, 'rebuild', false))
    return
  }
  store.setState({ screen: 'onboard', previousScreen: 'home' })
  await enqueueRender(() => renderOnboarding(bridge, store.getState().session))
}

async function startListening(setStatus: SetStatus): Promise<void> {
  const bridge = runtime.bridge
  if (!bridge) {
    setStatus('Bridge not connected')
    return
  }
  const state = store.getState()
  let handle = runtime.sessionHandle
  if (!handle) {
    handle = await startSession({
      goal: state.session.goal,
      participants: state.session.participants,
      timeboxMs: state.session.timeboxMs,
      prospect: state.session.prospect,
      offer: state.session.offer,
      successCriteria: state.session.successCriteria,
      knownObjections: state.session.knownObjections,
      nextAsk: state.session.nextAsk,
    }, { backendUrl: DEFAULT_BACKEND_URL })
    runtime.sessionHandle = handle
    if (runtime.memory) {
      await runtime.memory.startSession({
        sessionId: handle.sessionId,
        goal: state.session.goal,
        goalEmbedding: handle.goalEmbedding,
        participants: state.session.participants,
        timeboxMs: state.session.timeboxMs,
        startedAt: handle.startedAt,
        prospect: state.session.prospect,
        offer: state.session.offer,
        successCriteria: state.session.successCriteria,
        knownObjections: state.session.knownObjections,
        nextAsk: state.session.nextAsk,
      })
    }
  }
  handle = { ...handle, startedAt: Date.now() }
  runtime.sessionHandle = handle
  if (runtime.memory) {
    await runtime.memory.startSession({
      sessionId: handle.sessionId,
      goal: state.session.goal,
      goalEmbedding: handle.goalEmbedding,
      participants: state.session.participants,
      timeboxMs: state.session.timeboxMs,
      startedAt: handle.startedAt,
      prospect: state.session.prospect,
      offer: state.session.offer,
      successCriteria: state.session.successCriteria,
      knownObjections: state.session.knownObjections,
      nextAsk: state.session.nextAsk,
    })
  }
  store.setState({
    screen: 'armed',
    previousScreen: 'onboard',
    isRecording: true,
    finalTranscript: '',
    provisionalTranscript: '',
    session: {
      ...state.session,
      id: handle.sessionId,
      startedAt: handle.startedAt,
      goalEmbedding: Array.from(handle.goalEmbedding),
      alignBaseline: null,
      finalAlign: null,
      outcome: null,
    },
  })
  trigger.reset()
  trigger.onGoalSet({
    sessionId: handle.sessionId,
    goal: store.getState().session.goal,
    goalEmbedding: handle.goalEmbedding,
    timeboxMs: store.getState().session.timeboxMs,
    prospect: store.getState().session.prospect,
    offer: store.getState().session.offer,
    successCriteria: store.getState().session.successCriteria,
    knownObjections: store.getState().session.knownObjections,
    nextAsk: store.getState().session.nextAsk,
  })

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
    const state = store.getState()
    await runtime.memory.finaliseSession(state.session.id, {
      title: state.currentCard?.title ?? 'Sales session',
      finalAlign: state.session.finalAlign,
      outcome: state.session.outcome ?? 'completed',
    })
  }
  appendEventLog('Listening stopped')
}

async function finaliseCurrentSession(outcome: 'completed' | 'abandoned' | 'timeboxed' = 'completed'): Promise<void> {
  const state = store.getState()
  store.setState((current) => ({
    screen: 'finalising',
    previousScreen: current.screen,
    session: { ...current.session, outcome },
  }))
  if (runtime.bridge) {
    await enqueueRender(() => renderFinalising(runtime.bridge!, {
      segments: runtime.memory?.getSnapshot().segments.filter((segment) => segment.sessionId === state.session.id).length ?? state.cardHistory.length,
      outcome,
      message: 'done',
    }))
  }
  await stopListening(true)
  window.setTimeout(() => {
    store.resetSession()
    runtime.sessionHandle = null
    if (runtime.bridge) void enqueueRender(() => renderHome(runtime.bridge!, store.getState().session.goal, 'rebuild', store.getState().onboardingReady))
  }, 3_000)
}

function registerTriggerSubscription(setStatus: SetStatus): void {
  trigger.subscribe((event) => {
    void (async () => {
      if (event.kind === 'heartbeat') {
        await appendHeartbeat(event)
        return
      }
      const card = await summariseForEvent(event)
      store.setState((state) => ({
        session: {
          ...state.session,
          alignBaseline: event.baseline ?? state.session.alignBaseline,
          finalAlign: event.alignScore ?? state.session.finalAlign,
        },
      }))
      await surfaceCard(card, event)
      if (event.kind === 'actions') {
        setStatus('Wrap detected; finalising after silence')
        runtime.stopTimer = window.setTimeout(() => void finaliseCurrentSession('completed'), WRAP_SILENCE_STOP_MS)
      }
    })()
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
      showOnboarding: () => showOnboardingConfirm(setStatus),
      startListening: () => startListening(setStatus),
      stopListening,
      showPreviousCard: async () => {
        const history = store.getState().cardHistory
        const card = history[Math.max(0, history.length - 2)]
        if (card && runtime.bridge) await renderCard(runtime.bridge, card, 'upgrade')
      },
      dismissCard: async () => {
        if (store.getState().currentCard?.kind === 'actions') {
          await finaliseCurrentSession('completed')
          return
        }
        store.setState({ screen: 'armed', currentCard: null, cardShownAt: null })
        if (runtime.bridge) await renderArmed(runtime.bridge, store.getState())
      },
      saveCard: async () => {
        const card = store.getState().currentCard
        if (card?.kind === 'drift' && card.segmentId) {
          await runtime.memory?.markSegmentAccepted?.(card.segmentId, true)
        }
        if (card?.kind === 'actions') {
          await finaliseCurrentSession('completed')
          return
        }
        store.setState({ screen: 'armed', currentCard: null, cardShownAt: null })
        if (runtime.bridge) await renderArmed(runtime.bridge, store.getState())
      },
      muteDrift: () => trigger.muteDrift(DRIFT_MUTE_MS),
      renderHome: async () => {
        if (runtime.bridge) await renderHome(runtime.bridge, store.getState().session.goal, 'rebuild', store.getState().onboardingReady)
      },
      renderArmed: async () => {
        if (runtime.bridge) await renderArmed(runtime.bridge, store.getState())
      },
      forceMark: () => trigger.forceMark(),
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
    const detail = event.detail as SalesOnboardingDetail
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
  window.addEventListener('mindmirror:onboarding', ((event: CustomEvent) => {
    void prepareSalesOnboarding(event.detail as SalesOnboardingDetail)
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
        elapsedMs: 0,
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
        await enqueueRender(() => renderHome(runtime.bridge!, store.getState().session.goal, 'create', store.getState().onboardingReady))
        runtime.startupRendered = true
        runtime.tickTimer = window.setInterval(() => {
          if (store.getState().isRecording) trigger.tick()
        }, TICK_MS)
        setStatus('Connected. Open Onboarding, then tap glasses.')
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
        await showOnboardingConfirm(setStatus)
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
