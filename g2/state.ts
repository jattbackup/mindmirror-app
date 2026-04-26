import { CARD_TTL_MS, SESSION_TIMEBOX_MS } from '../_shared/constants'
import type { CardModel } from './render/card'

export type Screen = 'home' | 'armed' | 'card' | 'recall'

export type SessionMeta = {
  id: string
  goal: string
  participants: string[]
  startedAt: number | null
  timeboxMs: number
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
  currentCard: CardModel | null
  cardHistory: CardModel[]
  cardShownAt: number | null
  markedForProbe: boolean
}

export type G2Store = {
  getState(): G2State
  setState(patch: Partial<G2State> | ((state: G2State) => Partial<G2State>)): G2State
  subscribe(cb: (state: G2State) => void): () => void
  resetSession(): void
}

const initialState: G2State = {
  screen: 'home',
  previousScreen: null,
  isRecording: false,
  isWearing: true,
  batteryLevel: null,
  finalTranscript: '',
  provisionalTranscript: '',
  session: {
    id: '',
    goal: 'Decide next steps and owners.',
    participants: [],
    startedAt: null,
    timeboxMs: SESSION_TIMEBOX_MS,
  },
  currentCard: null,
  cardHistory: [],
  cardShownAt: null,
  markedForProbe: false,
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
          participants: [...state.session.participants],
          timeboxMs: state.session.timeboxMs,
        },
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
