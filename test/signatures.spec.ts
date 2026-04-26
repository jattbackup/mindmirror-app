import { describe, expect, it } from 'vitest'
import { SAMPLE_RATE, FRAME_BYTES, TICK_MS, DRIFT_MUTE_MS } from '../_shared/constants'
import { createTriggerEngine } from '../g2/trigger'
import { createMemory } from '../memory'
import { createMemoryMapBridge } from '../memory/store'
import { renderCard } from '../g2/render/card'
import { renderOnboarding } from '../g2/render/onboarding'
import { finaliseSession, startSession } from '../g2/session/lifecycle'

describe('required signatures', () => {
  it('exports constants required by audio and trigger code', () => {
    expect(SAMPLE_RATE).toBe(16_000)
    expect(FRAME_BYTES).toBe(40)
    expect(TICK_MS).toBe(30_000)
    expect(DRIFT_MUTE_MS).toBe(300_000)
  })

  it('creates the trigger engine public API', () => {
    const engine = createTriggerEngine({ now: () => 0, backendUrl: '/api' })
    expect(engine.onAudioFrame).toBeTypeOf('function')
    expect(engine.onFinalTranscript).toBeTypeOf('function')
    expect(engine.onProvisionalTranscript).toBeTypeOf('function')
    expect(engine.onWearingChanged).toBeTypeOf('function')
    expect(engine.onGoalSet).toBeTypeOf('function')
    expect(engine.subscribe).toBeTypeOf('function')
    expect(engine.forceMark).toBeTypeOf('function')
    expect(engine.muteDrift).toBeTypeOf('function')
    expect(engine.reset).toBeTypeOf('function')
  })

  it('creates memory with the required public API', async () => {
    const memory = await createMemory({ passphrase: '0000', bridge: createMemoryMapBridge() })
    expect(memory.startSession).toBeTypeOf('function')
    expect(memory.appendSegment).toBeTypeOf('function')
    expect(memory.finaliseSession).toBeTypeOf('function')
    expect(memory.search).toBeTypeOf('function')
    expect(memory.forgetSession).toBeTypeOf('function')
    expect(memory.forgetAll).toBeTypeOf('function')
    expect(memory.exportEncryptedBlob).toBeTypeOf('function')
  })

  it('exports render and lifecycle entrypoints', () => {
    expect(renderCard).toBeTypeOf('function')
    expect(renderOnboarding).toBeTypeOf('function')
    expect(startSession).toBeTypeOf('function')
    expect(finaliseSession).toBeTypeOf('function')
  })
})
