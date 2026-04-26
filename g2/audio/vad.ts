import { FRAME_MS } from '../../_shared/constants'

export type VadState = {
  rms: number
  zeroCrossingRate: number
  isSpeech: boolean
  silenceMs: number
}

export type Vad = {
  push(pcm: Uint8Array): VadState
  getState(): VadState
  reset(): void
}

const INITIAL: VadState = {
  rms: 0,
  zeroCrossingRate: 0,
  isSpeech: false,
  silenceMs: 0,
}

export function createVad(opts: { energyThreshold?: number } = {}): Vad {
  const threshold = opts.energyThreshold ?? 500
  let state: VadState = { ...INITIAL }

  return {
    push(pcm) {
      const sampleCount = Math.floor(pcm.length / 2)
      if (sampleCount === 0) return state

      let squares = 0
      let crossings = 0
      let prev = 0
      for (let i = 0; i < sampleCount; i++) {
        const lo = pcm[i * 2]
        const hi = pcm[i * 2 + 1]
        const sample = (hi << 8) | lo
        const signed = sample & 0x8000 ? sample - 0x10000 : sample
        squares += signed * signed
        if (i > 0 && Math.sign(signed) !== Math.sign(prev)) crossings++
        prev = signed
      }

      const rms = Math.sqrt(squares / sampleCount)
      const zeroCrossingRate = crossings / sampleCount
      const isSpeech = rms >= threshold && zeroCrossingRate < 0.45
      state = {
        rms,
        zeroCrossingRate,
        isSpeech,
        silenceMs: isSpeech ? 0 : state.silenceMs + FRAME_MS,
      }
      return state
    },
    getState: () => state,
    reset() {
      state = { ...INITIAL }
    },
  }
}
