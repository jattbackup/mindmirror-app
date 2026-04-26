export type SessionId = string
export type SegmentId = string

export type Session = {
  id: SessionId
  startedAt: number
  endedAt: number | null
  title: string | null
  locationHint: string | null
  participants: string[]
  tagIds: string[]
}

export type ActionItem = {
  who: string | null
  what: string
  due: string | null
}

export type Segment = {
  id: SegmentId
  sessionId: SessionId
  startedAt: number
  endedAt: number
  triggerThatClosedIt: 'closing_cue' | 'topic_shift' | 'silence' | 'motion' | 'periodic' | 'drift' | 'manual'
  summary: string
  bullets: string[]
  actionItems: ActionItem[]
  decisions: string[]
  embedding: Float32Array | number[]
  transcript?: string
}

export type MemorySnapshot = {
  version: 1
  sessions: Session[]
  segments: Segment[]
  updatedAt: number
}

export function assertSegment(value: unknown): asserts value is Segment {
  const seg = value as Partial<Segment>
  if (!seg || typeof seg !== 'object') throw new Error('segment must be an object')
  if (typeof seg.id !== 'string') throw new Error('segment.id is required')
  if (typeof seg.sessionId !== 'string') throw new Error('segment.sessionId is required')
  if (typeof seg.startedAt !== 'number') throw new Error('segment.startedAt is required')
  if (!Array.isArray(seg.bullets)) throw new Error('segment.bullets must be an array')
  if (!Array.isArray(seg.actionItems)) throw new Error('segment.actionItems must be an array')
  if (!Array.isArray(seg.decisions)) throw new Error('segment.decisions must be an array')
}

export function emptySnapshot(): MemorySnapshot {
  return {
    version: 1,
    sessions: [],
    segments: [],
    updatedAt: Date.now(),
  }
}
