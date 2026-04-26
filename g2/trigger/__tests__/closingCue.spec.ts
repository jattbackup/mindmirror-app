import { describe, expect, it } from 'vitest'
import { closingCueHit } from '../detectors/closingCue'

describe('closing cue detector', () => {
  it('matches wrap phrases', () => {
    for (const phrase of [
      'OK so let us wrap',
      'alright that is good',
      'okay talk soon',
      "great let's call it",
      'cool bye',
    ]) {
      expect(closingCueHit(phrase)).toBe(true)
    }
  })

  it('rejects hard negatives', () => {
    for (const phrase of [
      'OK actually wait we need one more thing',
      'not done yet',
      'before we wrap review this',
    ]) {
      expect(closingCueHit(phrase)).toBe(false)
    }
  })
})
