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

type SonioxToken = {
  text: string
  is_final: boolean
}

type SonioxResponse = {
  tokens?: SonioxToken[]
  finished?: boolean
  error_code?: number
  error_message?: string
}

type ConnectResponse = {
  url: string
  headers?: Record<string, string>
  expiresAt: number
}

export function createSttClient(opts: {
  backendUrl?: string
  installId: string
  provider?: 'soniox' | 'deepgram'
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
        ws.onopen = () => {
          if (provider === 'soniox') {
            ws?.send(JSON.stringify({
              model: 'stt-rt-preview',
              audio_format: 'pcm_s16le',
              sample_rate: SAMPLE_RATE,
              num_channels: 1,
              enable_endpoint_detection: true,
            }))
          }
          resolve()
        }
        ws.onerror = () => {
          const err = new Error('STT WebSocket error')
          opts.onError?.(err)
          reject(err)
        }
        ws.onmessage = (event) => {
          if (typeof event.data !== 'string') return
          try {
            const data = JSON.parse(event.data) as SonioxResponse
            if (data.error_code) {
              opts.onError?.(new Error(data.error_message ?? 'STT provider error'))
              return
            }
            let finalText = ''
            let provisionalText = ''
            for (const token of data.tokens ?? []) {
              if (token.text === '<end>') {
                finalText += '\n'
              } else if (token.is_final) {
                finalText += token.text
              } else {
                provisionalText += token.text
              }
            }
            if (finalText) opts.onFinal(finalText)
            opts.onProvisional(provisionalText)
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
      if (ws?.readyState === WebSocket.OPEN) ws.send(new Uint8Array(0))
      ws?.close()
      ws = null
    },
    isOpen() {
      return ws?.readyState === WebSocket.OPEN
    },
  }
}
