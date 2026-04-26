import type { IncomingMessage } from 'node:http'

export type SttConnectRequest = {
  provider: 'soniox' | 'deepgram'
  sampleRate: number
}

export function sttConnect(req: IncomingMessage, body: SttConnectRequest) {
  const host = req.headers.host ?? 'localhost:8787'
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'
  const provider = body.provider || 'soniox'
  return {
    url: `${proto}://${host}/stt/ws?provider=${encodeURIComponent(provider)}`,
    expiresAt: Date.now() + 5 * 60_000,
  }
}
