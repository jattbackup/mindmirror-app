import type { IncomingMessage } from 'node:http'

export type SttConnectRequest = {
  provider?: 'openai'
  sampleRate?: number
}

export function sttConnect(req: IncomingMessage, body: SttConnectRequest) {
  const host = req.headers.host ?? 'localhost:8787'
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'
  const provider = body.provider || 'openai'
  return {
    url: `${proto}://${host}/stt/ws?provider=${encodeURIComponent(provider)}&sampleRate=${encodeURIComponent(String(body.sampleRate ?? 16000))}`,
    provider,
    expiresAt: Date.now() + 5 * 60_000,
  }
}
