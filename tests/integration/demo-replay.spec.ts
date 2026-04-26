import { describe, expect, it } from 'vitest'
import { TICK_MS } from '../../_shared/constants'
import { vectorFromText } from '../../memory/vectorIndex'
import { createTriggerEngine, type TriggerEvent } from '../../g2/trigger'
import transcript from '../../fixtures/demo/transcript.json'
import expected from '../../fixtures/demo/expected.json'

describe('demo replay', () => {
  it('produces the expected sales coaching surface stream', () => {
    let now = 0
    const events: TriggerEvent[] = []
    const engine = createTriggerEngine({ now: () => now, backendUrl: '/api' })
    engine.subscribe((event) => {
      if (event.kind !== 'heartbeat') events.push(event)
    })
    const goal = 'Close a paid MindMirror pilot with Acme. Confirm the buyer owner and book legal review.'
    engine.onGoalSet({
      sessionId: 'demo',
      goal,
      goalEmbedding: new Float32Array(vectorFromText(goal)),
      timeboxMs: 900_000,
      prospect: 'Acme',
      offer: 'MindMirror pilot',
      nextAsk: 'book legal review',
    })

    let cursor = 0
    for (now = TICK_MS; now <= 330_000; now += TICK_MS) {
      while (cursor < transcript.length && transcript[cursor].atMs <= now) {
        engine.onFinalTranscript(transcript[cursor].text)
        cursor += 1
      }
      engine.tick()
    }

    const compact = events.map((event) => ({
      tickIndex: event.tickIndex,
      expectedKind: event.kind,
      expectedPhase: event.phase,
    }))
    expect(compact).toEqual(expected)
  })
})
