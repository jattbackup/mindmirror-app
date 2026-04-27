import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { corsHeaders, getInstallId } from './lib/auth.js'
import { createRateLimiter } from './lib/ratelimit.js'
import { safeLog } from './lib/redact.js'
import { embedTexts } from './routes/embed.js'
import { goalEmbed } from './routes/goal.embed.js'
import { goalScore } from './routes/goal.score.js'
import { driftCoach } from './routes/llm.drift.js'
import { summarise } from './routes/llm.summarise.js'
import { searchSegments } from './routes/search.js'
import { sttConnect, type SttConnectRequest } from './routes/stt.connect.js'

const limiter = createRateLimiter()

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) as T : {} as T
}

function send(res: ServerResponse, status: number, body: unknown, origin?: string): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(data),
    ...corsHeaders(origin),
  })
  res.end(data)
}

export function createMindMirrorServer() {
  const server = http.createServer(async (req, res) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '*'
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(origin))
      res.end()
      return
    }

    const installId = getInstallId(req)
    if (!limiter.check(installId)) {
      send(res, 429, { error: 'rate_limited' }, origin)
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        send(res, 200, { ok: true }, origin)
      } else if (req.method === 'POST' && url.pathname === '/stt/connect') {
        const body = await readJson<SttConnectRequest>(req)
        send(res, 200, sttConnect(req, body), origin)
      } else if (req.method === 'POST' && url.pathname === '/llm/drift-coach') {
        const body = await readJson<Parameters<typeof driftCoach>[0]>(req)
        send(res, 200, await driftCoach(body), origin)
      } else if (req.method === 'POST' && url.pathname === '/llm/summarise') {
        const body = await readJson<Parameters<typeof summarise>[0]>(req)
        const result = await summarise(body)
        send(res, 200, result, origin)
      } else if (req.method === 'POST' && url.pathname === '/embed') {
        const body = await readJson<Parameters<typeof embedTexts>[0]>(req)
        send(res, 200, await embedTexts(body), origin)
      } else if (req.method === 'POST' && url.pathname === '/goal/embed') {
        const body = await readJson<Parameters<typeof goalEmbed>[0]>(req)
        send(res, 200, await goalEmbed(body), origin)
      } else if (req.method === 'POST' && url.pathname === '/goal/score') {
        const body = await readJson<Parameters<typeof goalScore>[0]>(req)
        send(res, 200, await goalScore(body), origin)
      } else if (req.method === 'POST' && url.pathname === '/search') {
        const body = await readJson<{ q?: string; k?: number }>(req)
        send(res, 200, await searchSegments(body), origin)
      } else {
        send(res, 404, { error: 'not_found' }, origin)
      }
      safeLog('request complete', { path: url.pathname, method: req.method, installId })
    } catch (error) {
      safeLog('request failed', { path: url.pathname, error: error instanceof Error ? error.message : String(error) })
      send(res, 500, { error: 'internal_error' }, origin)
    }
  })

  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (url.pathname !== '/stt/ws') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      const upstream = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket')
      upstream.on('open', () => {
        client.on('message', (data) => {
          if (typeof data === 'string' || data instanceof Buffer) {
            const asText = data.toString()
            if (asText.startsWith('{')) {
              try {
                const config = JSON.parse(asText)
                upstream.send(JSON.stringify({ ...config, api_key: process.env.SONIOX_API_KEY }))
                return
              } catch {
                // Fall through to proxy raw data.
              }
            }
          }
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data)
        })
      })
      upstream.on('message', (data) => {
        if (client.readyState === WebSocket.OPEN) client.send(data)
      })
      upstream.on('close', () => client.close())
      upstream.on('error', () => client.close())
      client.on('close', () => upstream.close())
    })
  })

  return server
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8787)
  createMindMirrorServer().listen(port, () => {
    safeLog(`listening on ${port}`)
  })
}
