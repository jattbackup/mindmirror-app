export type BrowserMic = {
  start(): Promise<void>
  stop(): void
}

export function createBrowserMic(opts: {
  onAudio(pcm: Uint8Array): void
  onError?(error: Error): void
}): BrowserMic {
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let processor: ScriptProcessorNode | null = null

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      ctx = new AudioContext({ sampleRate: 16000 })
      const source = ctx.createMediaStreamSource(stream)
      // 4096 samples @ 16kHz = 256ms per chunk
      processor = ctx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]))
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        opts.onAudio(new Uint8Array(int16.buffer))
      }
      source.connect(processor)
      processor.connect(ctx.destination)
    },
    stop() {
      processor?.disconnect()
      void ctx?.close()
      stream?.getTracks().forEach((t) => t.stop())
      processor = null
      ctx = null
      stream = null
    },
  }
}
