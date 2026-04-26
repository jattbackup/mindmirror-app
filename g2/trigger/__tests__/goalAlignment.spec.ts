import { describe, expect, it } from 'vitest'
import { ALIGN_AFTER_MS, TICK_MS } from '../../../_shared/constants'
import { vectorFromText } from '../../../memory/vectorIndex'
import { createGoalAlignmentScorer } from '../detectors/goalAlignment'

describe('goal alignment scorer', () => {
  it('hides alignment during warmup and computes a baseline after four align ticks', () => {
    const scorer = createGoalAlignmentScorer()
    scorer.setGoal({
      sessionId: 's',
      goal: 'close SSO contract next step',
      goalEmbedding: new Float32Array(vectorFromText('close SSO contract next step')),
      timeboxMs: 900_000,
    })

    expect(scorer.score('small talk about coffee', ALIGN_AFTER_MS - 1, 0).alignScore).toBeNull()

    for (let i = 0; i < 4; i++) {
      scorer.score('close SSO contract next step buyer owner contract', ALIGN_AFTER_MS + i * TICK_MS, i * TICK_MS)
    }

    expect(scorer.getBaseline()).toBeGreaterThan(0.6)
  })

  it('breaches drift only after low alignment is sustained', () => {
    const scorer = createGoalAlignmentScorer()
    scorer.setGoal({
      sessionId: 's',
      goal: 'close SSO contract next step',
      goalEmbedding: new Float32Array(vectorFromText('close SSO contract next step')),
      timeboxMs: 900_000,
    })

    for (let i = 0; i < 4; i++) {
      scorer.score('close SSO contract next step buyer owner contract', ALIGN_AFTER_MS + i * TICK_MS, i * TICK_MS)
    }

    const firstLow = scorer.score('pricing tiers discount packaging coffee budget procurement renewal tangent', ALIGN_AFTER_MS + 4 * TICK_MS, 120_000)
    expect(firstLow.driftBreached).toBe(false)
    const sustained = scorer.score('pricing tiers discount packaging coffee budget procurement renewal tangent', ALIGN_AFTER_MS + 5 * TICK_MS, 151_000)
    expect(sustained.driftBreached).toBe(true)
  })
})
