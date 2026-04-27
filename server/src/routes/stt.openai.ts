import { WebSocket } from 'ws'

export const OPENAI_REALTIME_TRANSCRIPTION_URL = 'wss://api.openai.com/v1/realtime?intent=transcription'
export const OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-transcribe'

export type MindMirrorSttMessage =
  | { type: 'transcript.delta'; itemId: string; text: string }
  | { type: 'transcript.final'; itemId: string; text: string }
  | { type: 'error'; error: string }

type OpenAiTranscriptEvent = {
  type?: string
  item_id?: string
  delta?: string
  transcript?: string
  error?: { message?: string }
}

export function buildOpenAiTranscriptionSessionUpdate() {
  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: {
            type: 'audio/pcm',
            rate: 24000,
          },
          noise_reduction: {
            type: 'near_field',
          },
          transcription: {
            model: OPENAI_TRANSCRIBE_MODEL,
            prompt: '',
            language: 'en',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        },
      },
    },
  }
}

export function createOpenAiTranscriptNormalizer() {
  const byItem = new Map<string, string>()

  return (event: OpenAiTranscriptEvent): MindMirrorSttMessage | null => {
    if (event.type === 'conversation.item.input_audio_transcription.delta') {
      const itemId = event.item_id ?? ''
      const delta = event.delta ?? ''
      const text = `${byItem.get(itemId) ?? ''}${delta}`
      byItem.set(itemId, text)
      return { type: 'transcript.delta', itemId, text }
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const itemId = event.item_id ?? ''
      const text = event.transcript ?? byItem.get(itemId) ?? ''
      byItem.delete(itemId)
      return { type: 'transcript.final', itemId, text }
    }
    if (event.type === 'error') {
      return { type: 'error', error: event.error?.message ?? 'OpenAI STT error' }
    }
    return null
  }
}

export function createPcm16Resampler16To24() {
  let carry: number | null = null

  return {
    resample(chunk: Uint8Array): Uint8Array {
      const sampleCount = Math.floor(chunk.byteLength / 2)
      if (sampleCount === 0) return new Uint8Array()
      const view = new DataView(chunk.buffer, chunk.byteOffset, sampleCount * 2)

      const source: number[] = carry === null ? [] : [carry]
      for (let i = 0; i < sampleCount; i += 1) source.push(view.getInt16(i * 2, true))

      const pairCount = Math.floor(source.length / 2)
      const output = new Int16Array(pairCount * 3)
      for (let pair = 0; pair < pairCount; pair += 1) {
        const a = source[pair * 2]
        const b = source[pair * 2 + 1]
        const offset = pair * 3
        output[offset] = a
        output[offset + 1] = clampPcm16(Math.round(a + (b - a) * (2 / 3)))
        output[offset + 2] = b
      }

      carry = source.length % 2 === 1 ? source[source.length - 1] : null
      return new Uint8Array(output.buffer)
    },
    flush(): Uint8Array {
      if (carry === null) return new Uint8Array()
      const output = new Int16Array([carry])
      carry = null
      return new Uint8Array(output.buffer)
    },
  }
}

function clampPcm16(value: number): number {
  return Math.max(-32768, Math.min(32767, value))
}

export function buildOpenAiAudioAppendEvent(pcm24: Uint8Array) {
  return {
    type: 'input_audio_buffer.append',
    audio: Buffer.from(pcm24.buffer, pcm24.byteOffset, pcm24.byteLength).toString('base64'),
  }
}

function sendClient(client: WebSocket, message: MindMirrorSttMessage): void {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
}

function rawDataToUint8Array(data: WebSocket.RawData): Uint8Array {
  if (data instanceof Buffer) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  return new Uint8Array(Buffer.from(data))
}

export function attachOpenAiRealtimeStt(client: WebSocket): void {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    sendClient(client, { type: 'error', error: 'OPENAI_API_KEY is not configured' })
    client.close()
    return
  }

  const upstream = new WebSocket(OPENAI_REALTIME_TRANSCRIPTION_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const resampler = createPcm16Resampler16To24()
  const normalize = createOpenAiTranscriptNormalizer()
  let upstreamReady = false

  upstream.on('open', () => {
    upstreamReady = true
    upstream.send(JSON.stringify(buildOpenAiTranscriptionSessionUpdate()))
  })

  client.on('message', (data) => {
    if (!upstreamReady || upstream.readyState !== WebSocket.OPEN) return
    const pcm16 = rawDataToUint8Array(data)
    if (pcm16.byteLength === 0) return
    const pcm24 = resampler.resample(pcm16)
    if (pcm24.byteLength === 0) return
    upstream.send(JSON.stringify(buildOpenAiAudioAppendEvent(pcm24)))
  })

  upstream.on('message', (data) => {
    if (typeof data !== 'string' && !Buffer.isBuffer(data)) return
    try {
      const event = JSON.parse(data.toString()) as OpenAiTranscriptEvent
      const message = normalize(event)
      if (message) sendClient(client, message)
    } catch {
      sendClient(client, { type: 'error', error: 'Invalid OpenAI STT event' })
    }
  })

  upstream.on('close', () => client.close())
  upstream.on('error', () => {
    sendClient(client, { type: 'error', error: 'OpenAI STT WebSocket error' })
    client.close()
  })
  client.on('close', () => {
    const tail = resampler.flush()
    if (tail.byteLength > 0 && upstream.readyState === WebSocket.OPEN) {
      upstream.send(JSON.stringify(buildOpenAiAudioAppendEvent(tail)))
    }
    upstream.close()
  })
}
