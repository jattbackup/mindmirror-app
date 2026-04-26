import { describe, expect, it } from 'vitest'
import { goalEmbed } from '../src/routes/goal.embed.js'
import { goalScore } from '../src/routes/goal.score.js'
import { summarise } from '../src/routes/llm.summarise.js'

describe('goal backend routes', () => {
  it('embeds and scores goal-aligned segments', async () => {
    const embedded = await goalEmbed({ sessionId: 'sales-session', goal: 'close pilot and confirm buyer owner' })
    expect(embedded.sessionId).toBe('sales-session')
    expect(embedded.embedding).toBeTypeOf('string')
    const scored = await goalScore({
      sessionId: 'sales-session',
      segments: [
        'close pilot confirm buyer owner next step',
        'pricing tangent discount packaging procurement',
      ],
    })
    expect(scored.scores).toHaveLength(2)
    expect(scored.scores[0]).toBeGreaterThan(scored.scores[1])
  })

  it('returns goal-aware drift steer without echoing raw canary logs', async () => {
    const response = await summarise({
      transcriptTail: 'The buyer moved to pricing discounts and procurement timing.',
      phase: 'drift',
      goal: 'close pilot and confirm buyer owner',
      priorSummaries: [],
      alignScore: 0.38,
      driftFromBaseline: 0.31,
      style: 'drift',
    })
    expect(response.title).toContain('Drift')
    expect(response.steer).toBeTruthy()
    expect(response.bullets.length).toBeLessThanOrEqual(1)
  })
})
