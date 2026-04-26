import { describe, expect, it } from 'vitest'
import { createMemory } from '.'
import { createMemoryMapBridge } from './store'

describe('memory v2 schema', () => {
  it('starts sessions with sales goal metadata and excludes heartbeats from search', async () => {
    const memory = await createMemory({ passphrase: '0000', bridge: createMemoryMapBridge() })
    await memory.startSession({
      sessionId: 'session',
      goal: 'close pilot',
      goalEmbedding: new Float32Array([1, 0, 0]),
      participants: ['Aman'],
      timeboxMs: 900_000,
      startedAt: 1,
      prospect: 'Acme',
      offer: 'Pilot',
      successCriteria: ['confirm buyer'],
      knownObjections: ['budget'],
      nextAsk: 'book legal',
    })
    await memory.appendSegment({
      id: 'heartbeat',
      sessionId: 'session',
      startedAt: 2,
      endedAt: 2,
      kind: 'heartbeat',
      triggerThatFiredIt: 'tick',
      summary: '',
      bullets: [],
      actionItems: [],
      decisions: [],
      embedding: [],
      alignScore: null,
      driftFromBaseline: null,
      llmSteer: null,
      wasAccepted: null,
    })
    await memory.appendSegment({
      id: 'recap',
      sessionId: 'session',
      startedAt: 3,
      endedAt: 4,
      kind: 'recap',
      triggerThatFiredIt: 'tick',
      summary: 'Buyer agreed to pilot review',
      bullets: ['Buyer agreed to pilot review'],
      actionItems: [],
      decisions: [],
      embedding: [1, 0, 0],
      alignScore: 0.8,
      driftFromBaseline: 0,
      llmSteer: null,
      wasAccepted: null,
    })

    const snapshot = memory.getSnapshot()
    expect(snapshot.sessions[0].prospect).toBe('Acme')
    const hits = await memory.search('pilot', 5)
    expect(hits.map((hit) => hit.segmentId)).toEqual(['recap'])
  })
})
