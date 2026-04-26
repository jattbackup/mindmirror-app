import { describe, expect, it } from 'vitest'
import { SAMPLE_RATE, FRAME_BYTES, TICK_MS } from '../_shared/constants'
import { createTriggerEngine } from '../g2/trigger'
import { createMemory } from '../memory'
import { createMemoryMapBridge } from '../memory/store'

describe('required signatures', () => {
  it('exports constants required by audio and trigger code', () => {
    expect(SAMPLE_RATE).toBe(16_000)
    expect(FRAME_BYTES).toBe(40)
    expect(TICK_MS).toBe(30_000)
  })

  it('creates the trigger engine public API', () => {
    const engine = createTriggerEngine({ now: () => 0 })
    expect(engine.onAudioFrame).toBeTypeOf('function')
    expect(engine.onFinalTranscript).toBeTypeOf('function')
    expect(engine.onProvisionalTranscript).toBeTypeOf('function')
    expect(engine.onWearingChanged).toBeTypeOf('function')
    expect(engine.subscribe).toBeTypeOf('function')
    expect(engine.forceProbe).toBeTypeOf('function')
    expect(engine.reset).toBeTypeOf('function')
  })

  it('creates memory with the required public API', async () => {
    const memory = await createMemory({ passphrase: '0000', bridge: createMemoryMapBridge() })
    expect(memory.appendSegment).toBeTypeOf('function')
    expect(memory.finaliseSession).toBeTypeOf('function')
    expect(memory.search).toBeTypeOf('function')
    expect(memory.forgetSession).toBeTypeOf('function')
    expect(memory.forgetAll).toBeTypeOf('function')
    expect(memory.exportEncryptedBlob).toBeTypeOf('function')
  })
})
