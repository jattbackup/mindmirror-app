import { ulid } from 'ulid'
import { GOAL_EMBED_TTL_MS } from '../../_shared/constants'
import { vectorFromText } from '../../memory/vectorIndex'

export type SessionStartArgs = {
  goal: string
  participants: string[]
  timeboxMs: number
  prospect?: string
  offer?: string
  successCriteria?: string[]
  knownObjections?: string[]
  nextAsk?: string
}

export type SessionHandle = {
  sessionId: string
  startedAt: number
  goalEmbedding: Float32Array
}

function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

export async function startSession(args: SessionStartArgs, opts: { backendUrl: string }): Promise<SessionHandle> {
  const sessionId = ulid()
  const startedAt = Date.now()
  const goalText = [
    args.goal,
    args.successCriteria?.join(' '),
    args.knownObjections?.join(' '),
    args.nextAsk,
  ].filter(Boolean).join(' ')

  try {
    const response = await fetch(`${opts.backendUrl.replace(/\/$/, '')}/goal/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, goal: goalText.slice(0, 500) }),
    })
    if (response.ok) {
      const json = await response.json() as { embedding?: string; sessionId?: string; ttlMs?: number }
      if (json.embedding && (json.ttlMs ?? GOAL_EMBED_TTL_MS) > 0) {
        return {
          sessionId: json.sessionId ?? sessionId,
          startedAt,
          goalEmbedding: base64ToFloat32(json.embedding),
        }
      }
    }
  } catch {
    // Local lexical fallback keeps the demo deterministic when the backend is unavailable.
  }

  return {
    sessionId,
    startedAt,
    goalEmbedding: new Float32Array(vectorFromText(goalText)),
  }
}

export async function finaliseSession(
  _handle: SessionHandle,
  _opts: {
    outcome: 'completed' | 'abandoned' | 'timeboxed'
    finalAlign: number | null
  },
): Promise<void> {
  // The durable write is owned by memory.finaliseSession in the WebView runtime.
}
