import { describe, expect, it } from 'vitest'
import { MIN_CONTENT_TOKENS, TICK_MS } from '../../../_shared/constants'
import { createTriggerEngine } from '..'

describe('trigger engine', () => {
  it('fires metronome recap when enough content exists', () => {
    let t = 0
    const events: unknown[] = []
    const engine = createTriggerEngine({ now: () => t })
    engine.subscribe((event) => events.push(event))
    engine.onFinalTranscript(Array.from({ length: MIN_CONTENT_TOKENS + 2 }, (_, i) => `word${i}`).join(' '))
    t = TICK_MS + 1
    engine.tick()
    expect(events).toHaveLength(1)
  })

  it('fires wrap on closing cue', () => {
    let t = 100_000
    const events: Array<{ reason: string }> = []
    const engine = createTriggerEngine({ now: () => t })
    engine.subscribe((event) => events.push(event))
    engine.onFinalTranscript(`${Array.from({ length: 60 }, (_, i) => `schema${i}`).join(' ')} okay talk soon`)
    expect(events.some((event) => event.reason === 'closing_cue')).toBe(true)
  })
})
