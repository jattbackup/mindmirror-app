import { DEFAULT_BACKEND_URL, DEFAULT_STT_PROVIDER, SAMPLE_RATE } from '../../_shared/constants'

export type TranscriptToken = {
  text: string
  isFinal: boolean
}

export type SttClient = {
  connect(): Promise<void>
  sendAudio(pcm: Uint8Array): void
  close(): void
  isOpen(): boolean
}

type SttProvider = typeof DEFAULT_STT_PROVIDER

type ConnectResponse = {
  url: string
  provider?: SttProvider
  expiresAt: number
}

export type SttServerMessage =
  | { type: 'transcript.delta'; itemId: string; text: string }
  | { type: 'transcript.final'; itemId: string; text: string }
  | { type: 'error'; error: string }

export function parseSttServerMessage(raw: string): SttServerMessage | null {
  const data = JSON.parse(raw) as Partial<SttServerMessage>
  if (data.type === 'transcript.delta' && typeof data.text === 'string') {
    return { type: data.type, itemId: String(data.itemId ?? ''), text: data.text }
  }
  if (data.type === 'transcript.final' && typeof data.text === 'string') {
    return { type: data.type, itemId: String(data.itemId ?? ''), text: data.text }
  }
  if (data.type === 'error') {
    return { type: data.type, error: String(data.error ?? 'STT provider error') }
  }
  return null
}

export function createSttClient(opts: {
  backendUrl?: string
  installId: string
  provider?: SttProvider
  onFinal(text: string): void
  onProvisional(text: string): void
  onError?(error: Error): void
}): SttClient {
  const backendUrl = opts.backendUrl ?? DEFAULT_BACKEND_URL
  const provider = opts.provider ?? DEFAULT_STT_PROVIDER
  let ws: WebSocket | null = null

  const connectUrl = `${backendUrl.replace(/\/$/, '')}/stt/connect`

  return {
    async connect() {
      const response = await fetch(connectUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mm-install-id': opts.installId,
        },
        body: JSON.stringify({ provider, sampleRate: SAMPLE_RATE }),
      })
      if (!response.ok) throw new Error(`STT connect failed: ${response.status}`)
      const payload = (await response.json()) as ConnectResponse

      await new Promise<void>((resolve, reject) => {
        ws = new WebSocket(payload.url)
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => resolve()
        ws.onerror = () => {
          const err = new Error('STT WebSocket error')
          opts.onError?.(err)
          reject(err)
        }
        ws.onmessage = (event) => {
          if (typeof event.data !== 'string') return
          try {
            const message = parseSttServerMessage(event.data)
            if (!message) return
            if (message.type === 'error') {
              opts.onError?.(new Error(message.error))
            } else if (message.type === 'transcript.delta') {
              opts.onProvisional(message.text)
            } else {
              opts.onFinal(message.text)
            }
          } catch (error) {
            opts.onError?.(error instanceof Error ? error : new Error(String(error)))
          }
        }
        ws.onclose = () => {
          ws = null
        }
      })
    },
    sendAudio(pcm) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(pcm)
    },
    close() {
      if (ws?.readyState === WebSocket.OPEN) ws.send(new Uint8Array(0).buffer)
      ws?.close()
      ws = null
    },
    isOpen() {
      return ws?.readyState === WebSocket.OPEN
    },
  }
}
