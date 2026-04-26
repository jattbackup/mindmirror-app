import { describe, expect, it, vi } from 'vitest'
import { TICK_MS } from '../../../_shared/constants'
import { createMetronome } from '../metronome'

describe('metronome', () => {
  it('fires gapless 30 second ticks over 12 minutes', () => {
    vi.useFakeTimers()
    const ticks: number[] = []
    const metronome = createMetronome({ onTick: (index) => ticks.push(index) })
    metronome.start()
    vi.advanceTimersByTime(12 * 60_000)
    metronome.stop()
    vi.useRealTimers()

    expect(ticks).toHaveLength(24)
    expect(ticks).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
    expect(TICK_MS).toBe(30_000)
  })
})
