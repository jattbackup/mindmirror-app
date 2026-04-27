import { CARD_TTL_MS, DEFAULT_SALES_GOAL, DEFAULT_SALES_NEXT_ASK, DEFAULT_SALES_OFFER, DEFAULT_SALES_PROSPECT, SESSION_TIMEBOX_MS } from '../_shared/constants'
import type { CardModel } from './render/card'

export type Screen = 'intro' | 'home' | 'onboard' | 'armed' | 'card' | 'finalising' | 'recall'

export type SessionMeta = {
  id: string
  goal: string
  goalEmbedding: number[]
  participants: string[]
  prospect: string
  offer: string
  successCriteria: string[]
  knownObjections: string[]
  nextAsk: string
  startedAt: number | null
  timeboxMs: number
  alignBaseline: number | null
  finalAlign: number | null
  outcome: 'completed' | 'abandoned' | 'timeboxed' | null
}

export type G2State = {
  screen: Screen
  previousScreen: Screen | null
  isRecording: boolean
  isWearing: boolean
  batteryLevel: number | null
  finalTranscript: string
  provisionalTranscript: string
  session: SessionMeta
  onboardingReady: boolean
  currentCard: CardModel | null
  cardHistory: CardModel[]
  cardShownAt: number | null
  markedForProbe: boolean
  lastAlignScore: number | null
}

export type G2Store = {
  getState(): G2State
  setState(patch: Partial<G2State> | ((state: G2State) => Partial<G2State>)): G2State
  subscribe(cb: (state: G2State) => void): () => void
  resetSession(): void
}

const initialState: G2State = {
  screen: 'intro',
  previousScreen: null,
  isRecording: false,
  isWearing: true,
  batteryLevel: null,
  finalTranscript: '',
  provisionalTranscript: '',
  session: {
    id: '',
    goal: DEFAULT_SALES_GOAL,
    goalEmbedding: [],
    participants: [],
    prospect: DEFAULT_SALES_PROSPECT,
    offer: DEFAULT_SALES_OFFER,
    successCriteria: [],
    knownObjections: [],
    nextAsk: DEFAULT_SALES_NEXT_ASK,
    startedAt: null,
    timeboxMs: SESSION_TIMEBOX_MS,
    alignBaseline: null,
    finalAlign: null,
    outcome: null,
  },
  onboardingReady: false,
  currentCard: null,
  cardHistory: [],
  cardShownAt: null,
  markedForProbe: false,
  lastAlignScore: null,
}

export function createG2Store(): G2Store {
  let state: G2State = structuredClone(initialState)
  const subscribers = new Set<(state: G2State) => void>()

  const emit = () => subscribers.forEach((cb) => cb(state))

  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      emit()
      return state
    },
    subscribe(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    resetSession() {
      state = {
        ...structuredClone(initialState),
        session: {
          ...structuredClone(initialState.session),
          goal: state.session.goal,
          goalEmbedding: [...state.session.goalEmbedding],
          participants: [...state.session.participants],
          prospect: state.session.prospect,
          offer: state.session.offer,
          successCriteria: [...state.session.successCriteria],
          knownObjections: [...state.session.knownObjections],
          nextAsk: state.session.nextAsk,
          timeboxMs: state.session.timeboxMs,
        },
        onboardingReady: state.onboardingReady,
      }
      emit()
    },
  }
}

export function fullTranscript(state: G2State): string {
  return `${state.finalTranscript}${state.provisionalTranscript}`
}

export function isCardExpired(state: G2State, now = Date.now()): boolean {
  return state.cardShownAt !== null && now - state.cardShownAt > CARD_TTL_MS
}
