import { lexicalVector, cosine } from '../g2/trigger/detectors/embeddingNovelty'
import type { Segment } from './schema'

export type IndexedSegment = {
  segmentId: string
  sessionId: string
  ts: number
  text: string
  vector: number[]
}

export function vectorFromText(text: string): number[] {
  return lexicalVector(text, 384)
}

export function vectorFromSegment(segment: Segment): number[] {
  const existing = Array.from(segment.embedding as ArrayLike<number>)
  if (existing.length) return existing
  return vectorFromText(`${segment.summary} ${segment.bullets.join(' ')} ${segment.decisions.join(' ')}`)
}

export class VectorIndex {
  private items: IndexedSegment[] = []

  rebuild(segments: Segment[]): void {
    this.items = segments.map((segment) => ({
      segmentId: segment.id,
      sessionId: segment.sessionId,
      ts: segment.startedAt,
      text: `${segment.summary} ${segment.bullets.join(' ')} ${segment.decisions.join(' ')}`,
      vector: vectorFromSegment(segment),
    }))
  }

  search(query: string, k: number): Array<IndexedSegment & { score: number }> {
    const queryVector = vectorFromText(query)
    return this.items
      .map((item) => ({ ...item, score: cosine(queryVector, item.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }
}
