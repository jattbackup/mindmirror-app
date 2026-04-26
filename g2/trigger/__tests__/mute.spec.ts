import { describe, expect, it } from 'vitest'
import { ALIGN_AFTER_MS, TICK_MS } from '../../../_shared/constants'
import { vectorFromText } from '../../../memory/vectorIndex'
import { createGoalAlignmentScorer } from '../detectors/goalAlignment'

describe('drift mute', () => {
  it('suppresses drift cards while muted', () => {
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
    scorer.muteDrift(200_000)
    const muted = scorer.score('pricing tiers discount packaging coffee budget procurement renewal tangent', ALIGN_AFTER_MS + 5 * TICK_MS, 160_000)
    expect(muted.driftBreached).toBe(false)
    const unmuted = scorer.score('pricing tiers discount packaging coffee budget procurement renewal tangent', ALIGN_AFTER_MS + 6 * TICK_MS, 231_000)
    expect(unmuted.driftBreached).toBe(true)
  })
})
