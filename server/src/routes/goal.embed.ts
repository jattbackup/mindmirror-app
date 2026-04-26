import { embedTexts } from './embed.js'

const GOAL_EMBED_TTL_MS = 90 * 60_000
const cache = new Map<string, { embedding: string; expiresAt: number }>()

export type GoalEmbedRequest = {
  sessionId?: string
  goal?: string
}

export async function goalEmbed(req: GoalEmbedRequest): Promise<{ sessionId: string; embedding: string; ttlMs: number }> {
  const sessionId = req.sessionId || crypto.randomUUID()
  const goal = String(req.goal ?? '').slice(0, 500)
  const cached = cache.get(sessionId)
  if (cached && cached.expiresAt > Date.now()) {
    return { sessionId, embedding: cached.embedding, ttlMs: cached.expiresAt - Date.now() }
  }
  const embedded = await embedTexts({ texts: [goal] })
  const embedding = embedded.embeddings[0]
  cache.set(sessionId, { embedding, expiresAt: Date.now() + GOAL_EMBED_TTL_MS })
  return { sessionId, embedding, ttlMs: GOAL_EMBED_TTL_MS }
}

export function getCachedGoalEmbedding(sessionId: string): string | null {
  const cached = cache.get(sessionId)
  if (!cached || cached.expiresAt <= Date.now()) return null
  return cached.embedding
}
