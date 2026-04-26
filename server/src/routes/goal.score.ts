import { Buffer } from 'node:buffer'
import { embedTexts } from './embed.js'
import { getCachedGoalEmbedding } from './goal.embed.js'

export type GoalScoreRequest = {
  sessionId?: string
  goal?: string
  segments?: string[]
}

function base64ToFloats(base64: string): Float32Array {
  const buf = Buffer.from(base64, 'base64')
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / Float32Array.BYTES_PER_ELEMENT)
}

function dot(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length)
  let value = 0
  for (let i = 0; i < len; i++) value += a[i] * b[i]
  return value
}

export async function goalScore(req: GoalScoreRequest): Promise<{ scores: number[]; baseline: number | null; drift: number[] }> {
  const segments = req.segments ?? []
  const goalEmbedding =
    (req.sessionId ? getCachedGoalEmbedding(req.sessionId) : null) ??
    (await embedTexts({ texts: [req.goal ?? ''] })).embeddings[0]
  const goalVector = base64ToFloats(goalEmbedding)
  const segmentEmbeddings = await embedTexts({ texts: segments })
  const scores = segmentEmbeddings.embeddings.map((item) => Math.max(0, Math.min(1, dot(goalVector, base64ToFloats(item)))))
  const baseline = scores.length >= 4 ? scores.slice(0, 4).reduce((sum, item) => sum + item, 0) / 4 : null
  const drift = scores.map((score) => baseline === null ? 0 : Math.max(0, baseline - score))
  return { scores, baseline, drift }
}
