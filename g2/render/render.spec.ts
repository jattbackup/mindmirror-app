import { describe, expect, it } from 'vitest'
import { buildArmedPage } from './armed'
import { buildCardPage } from './card'
import { buildFinalisingPage } from './finalising'
import { buildHomePage } from './home'
import { buildOnboardingPage } from './onboarding'
import { buildRecallPage } from './recall'
import type { G2State } from '../state'

function textObjects(page: unknown): Array<{ isEventCapture?: number; content?: string }> {
  return ((page as { textObject?: unknown[] }).textObject ?? []) as Array<{ isEventCapture?: number; content?: string }>
}

function assertSimulatorSafe(page: unknown) {
  const p = page as { containerTotalNum?: number; textObject?: unknown[]; imageObject?: unknown[]; listObject?: unknown[] }
  const text = p.textObject ?? []
  const image = p.imageObject ?? []
  const list = p.listObject ?? []
  expect(p.containerTotalNum).toBeLessThanOrEqual(4)
  expect(text.length + image.length + list.length).toBe(p.containerTotalNum)
  expect(textObjects(page).filter((item) => item.isEventCapture === 1)).toHaveLength(1)
  for (const item of textObjects(page)) expect((item.content ?? '').length).toBeLessThanOrEqual(1000)
}

const state: G2State = {
  screen: 'armed',
  previousScreen: 'onboard',
  isRecording: true,
  isWearing: true,
  batteryLevel: 80,
  finalTranscript: '',
  provisionalTranscript: '',
  session: {
    id: 's',
    goal: 'Close the pilot and confirm the buyer owner.',
    goalEmbedding: [],
    participants: ['Aman', 'Dana'],
    prospect: 'Acme',
    offer: 'MindMirror pilot',
    successCriteria: [],
    knownObjections: [],
    nextAsk: 'Book legal review',
    startedAt: 0,
    timeboxMs: 900_000,
    alignBaseline: null,
    finalAlign: null,
    outcome: null,
  },
  onboardingReady: true,
  currentCard: null,
  cardHistory: [],
  cardShownAt: null,
  markedForProbe: false,
}

describe('G2 renderers', () => {
  it('keeps every page simulator safe with one event capture container', () => {
    for (const page of [
      buildHomePage(state.session.goal, true),
      buildOnboardingPage(state.session),
      buildArmedPage(state, 0),
      buildCardPage({ kind: 'recap', title: 'Toward close', bullets: ['Buyer agreed to pilot'], tickIndex: 1 }),
      buildCardPage({ kind: 'drift', title: 'Drift', bullets: ['Pricing tangent'], steer: 'Let us lock the pilot owner.', alignScore: 0.4, driftFromBaseline: 0.3 }),
      buildFinalisingPage({ segments: 3, outcome: 'completed' }),
      buildRecallPage([]),
    ]) {
      assertSimulatorSafe(page)
    }
  })
})
