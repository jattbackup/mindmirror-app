import { describe, expect, it } from 'vitest'
import { canSurface } from '../cooldown'

describe('cooldown', () => {
  it('suppresses low priority events during cooldown', () => {
    expect(canSurface({
      now: 10_000,
      lastSurfaceAt: 5_000,
      lastReason: 'tick',
      nextReason: 'tick',
      cooldownMs: 12_000,
    })).toBe(false)
  })

  it('allows a closing cue to preempt cooldown', () => {
    expect(canSurface({
      now: 10_000,
      lastSurfaceAt: 5_000,
      lastReason: 'tick',
      nextReason: 'closing_cue',
      cooldownMs: 12_000,
    })).toBe(true)
  })
})
