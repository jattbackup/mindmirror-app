import { describe, expect, it } from 'vitest'
import { buildIntroFrames, MINDMIRROR_ASCII } from './ascii'

describe('intro ASCII frames', () => {
  it('keeps every frame ASCII and under HUD payload limits', () => {
    const frames = buildIntroFrames(MINDMIRROR_ASCII)
    expect(frames.length).toBeGreaterThan(1)
    for (const frame of frames) {
      expect(frame.length).toBeLessThanOrEqual(900)
      expect(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(frame)).toBe(true)
    }
  })

  it('is pure for the same input', () => {
    expect(buildIntroFrames(MINDMIRROR_ASCII)).toEqual(buildIntroFrames(MINDMIRROR_ASCII))
  })
})
