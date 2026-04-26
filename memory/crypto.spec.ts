import { describe, expect, it } from 'vitest'
import { encryptJson, decryptJson } from './crypto'
import { createMemory } from '.'
import { createMemoryMapBridge } from './store'

describe('memory crypto', () => {
  it('round-trips AES-GCM JSON without exposing plaintext', async () => {
    const marker = 'MINDMIRROR_SECRET_MARKER'
    const encrypted = await encryptJson({ marker }, 'passphrase')
    const raw = JSON.stringify(encrypted)
    expect(raw).not.toContain(marker)
    await expect(decryptJson<{ marker: string }>(encrypted, 'passphrase')).resolves.toEqual({ marker })
  })

  it('stores encrypted bridge KV chunks without plaintext', async () => {
    const bridge = createMemoryMapBridge()
    const memory = await createMemory({ passphrase: '0000', bridge })
    await memory.appendSegment({
      id: 'seg1',
      sessionId: 'sess1',
      startedAt: 1,
      endedAt: 2,
      triggerThatClosedIt: 'periodic',
      summary: 'Plaintext should not be visible',
      bullets: ['Plaintext should not be visible'],
      actionItems: [],
      decisions: [],
      embedding: [1, 0, 0],
      transcript: 'Plaintext should not be visible',
    })
    const joined = Array.from(bridge.map.values()).join('\n')
    expect(joined).not.toContain('Plaintext should not be visible')
  })
})
