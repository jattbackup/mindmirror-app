import { describe, expect, it } from 'vitest'
import { parseSttServerMessage } from './stt-client'

describe('G2 STT client protocol', () => {
  it('parses OpenAI-backed transcript messages', () => {
    expect(parseSttServerMessage(JSON.stringify({
      type: 'transcript.delta',
      itemId: 'item_1',
      text: 'hello',
    }))).toEqual({ type: 'transcript.delta', itemId: 'item_1', text: 'hello' })

    expect(parseSttServerMessage(JSON.stringify({
      type: 'transcript.final',
      itemId: 'item_1',
      text: 'hello there',
    }))).toEqual({ type: 'transcript.final', itemId: 'item_1', text: 'hello there' })
  })
})
