import { describe, expect, it } from 'vitest'
import { createMemoryMapBridge } from '../memory/store'

describe('raw audio privacy', () => {
  it('does not write raw PCM-looking bytes to bridge storage in the memory path', async () => {
    const bridge = createMemoryMapBridge()
    const rawPcm = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    await bridge.setLocalStorage('mm.installId', 'install')
    const values = Array.from(bridge.map.values()).join('')
    expect(values).not.toContain(String.fromCharCode(...rawPcm))
  })
})
