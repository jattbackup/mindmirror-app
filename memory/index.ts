import { DEFAULT_BACKEND_URL } from '../_shared/constants'
import { encryptJson, decryptJson, type EncryptedPayload } from './crypto'
import { assertSegment, emptySnapshot, type MemorySnapshot, type Segment, type Session } from './schema'
import { createBridgeChunkStore, type StorageBridge } from './store'
import { VectorIndex } from './vectorIndex'

export type SearchHit = {
  segmentId: string
  sessionId: string
  score: number
  snippet: string
  ts: number
}

export type Memory = {
  startSession(init: {
    sessionId: string
    goal: string
    goalEmbedding: Float32Array
    participants: string[]
    timeboxMs: number
    startedAt: number
    prospect?: string
    offer?: string
    successCriteria?: string[]
    knownObjections?: string[]
    nextAsk?: string
  }): Promise<void>
  appendSegment(seg: Segment): Promise<void>
  finaliseSession(sessionId: string, args: {
    title: string | null
    finalAlign: number | null
    outcome: 'completed' | 'abandoned' | 'timeboxed'
  }): Promise<void>
  search(query: string, k?: number): Promise<SearchHit[]>
  forgetSession(sessionId: string): Promise<void>
  forgetAll(): Promise<void>
  exportEncryptedBlob(): Promise<Blob>
  getSnapshot(): MemorySnapshot
  markSegmentAccepted?(segmentId: string, accepted: boolean): Promise<void>
}

export async function createMemory(opts: {
  passphrase: string
  backendUrl?: string
  bridge?: StorageBridge
}): Promise<Memory> {
  const backendUrl = opts.backendUrl ?? DEFAULT_BACKEND_URL
  const store = createBridgeChunkStore(opts.bridge)
  const vectorIndex = new VectorIndex()
  let encryptedCache = await store.read()
  let snapshot = await loadSnapshot(encryptedCache, opts.passphrase)
  vectorIndex.rebuild(snapshot.segments)

  async function persist(): Promise<void> {
    snapshot = { ...snapshot, updatedAt: Date.now() }
    const encrypted = await encryptJson(snapshot, opts.passphrase)
    encryptedCache = JSON.stringify(encrypted)
    await store.write(encryptedCache)
    vectorIndex.rebuild(snapshot.segments)
  }

  return {
    async startSession(init) {
      snapshot.sessions = snapshot.sessions.filter((existing) => existing.id !== init.sessionId)
      snapshot.sessions.push({
        id: init.sessionId,
        startedAt: init.startedAt,
        endedAt: null,
        title: null,
        locationHint: null,
        participants: init.participants,
        goal: init.goal,
        goalEmbedding: Array.from(init.goalEmbedding),
        timeboxMs: init.timeboxMs,
        prospect: init.prospect,
        offer: init.offer,
        successCriteria: init.successCriteria ?? [],
        knownObjections: init.knownObjections ?? [],
        nextAsk: init.nextAsk,
        alignBaseline: null,
        finalAlign: null,
        outcome: null,
        tagIds: [],
      })
      await persist()
    },
    async appendSegment(seg) {
      assertSegment(seg)
      const sessionExists = snapshot.sessions.some((session) => session.id === seg.sessionId)
      if (!sessionExists) {
        snapshot.sessions.push({
          id: seg.sessionId,
          startedAt: seg.startedAt,
          endedAt: null,
          title: null,
          locationHint: null,
          participants: [],
          goal: '',
          goalEmbedding: [],
          timeboxMs: 0,
          alignBaseline: null,
          finalAlign: null,
          outcome: null,
          tagIds: [],
        })
      }
      snapshot.segments = snapshot.segments.filter((existing) => existing.id !== seg.id)
      snapshot.segments.push(serialiseSegment(seg))
      await persist()
    },
    async finaliseSession(sessionId, args) {
      const session = snapshot.sessions.find((item) => item.id === sessionId)
      if (session) {
        session.endedAt = Date.now()
        session.title = args.title
        session.finalAlign = args.finalAlign
        session.outcome = args.outcome
      }
      await persist()
    },
    async search(query, k = 5) {
      const local = vectorIndex.search(query, k).map((hit) => ({
        segmentId: hit.segmentId,
        sessionId: hit.sessionId,
        score: hit.score,
        snippet: hit.text.slice(0, 240),
        ts: hit.ts,
      }))

      try {
        await fetch(`${backendUrl.replace(/\/$/, '')}/search`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: query, k }),
        })
      } catch {
        // Tier 3 search is optional; local encrypted memory remains authoritative.
      }

      return local
    },
    async forgetSession(sessionId) {
      snapshot.sessions = snapshot.sessions.filter((session) => session.id !== sessionId)
      snapshot.segments = snapshot.segments.filter((segment) => segment.sessionId !== sessionId)
      await persist()
    },
    async forgetAll() {
      snapshot = emptySnapshot()
      encryptedCache = ''
      await store.clear()
      vectorIndex.rebuild([])
    },
    async exportEncryptedBlob() {
      if (!encryptedCache) {
        const encrypted = await encryptJson(snapshot, opts.passphrase)
        encryptedCache = JSON.stringify(encrypted)
      }
      return new Blob([encryptedCache], { type: 'application/json' })
    },
    getSnapshot() {
      return structuredClone(snapshot)
    },
    async markSegmentAccepted(segmentId, accepted) {
      const segment = snapshot.segments.find((item) => item.id === segmentId)
      if (segment) segment.wasAccepted = accepted
      await persist()
    },
  }
}

async function loadSnapshot(raw: string, passphrase: string): Promise<MemorySnapshot> {
  if (!raw) return emptySnapshot()
  const payload = JSON.parse(raw) as EncryptedPayload
  const decrypted = await decryptJson<MemorySnapshot | LegacySnapshot>(payload, passphrase)
  return migrateSnapshot(decrypted)
}

function serialiseSegment(seg: Segment): Segment {
  return {
    ...seg,
    embedding: Array.from(seg.embedding as ArrayLike<number>),
    transcript: seg.transcript,
  }
}

type LegacySnapshot = {
  version: 1
  sessions: Array<Partial<Session> & { id: string; startedAt: number }>
  segments: Array<Partial<Segment> & {
    id: string
    sessionId: string
    startedAt: number
    triggerThatClosedIt?: Segment['triggerThatClosedIt']
  }>
  updatedAt: number
}

function migrateSnapshot(snapshot: MemorySnapshot | LegacySnapshot): MemorySnapshot {
  if (snapshot.version === 2) return snapshot
  return {
    version: 2,
    sessions: snapshot.sessions.map((session) => ({
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? null,
      title: session.title ?? null,
      locationHint: session.locationHint ?? null,
      participants: session.participants ?? [],
      goal: session.goal ?? '',
      goalEmbedding: Array.from(session.goalEmbedding ?? []),
      timeboxMs: session.timeboxMs ?? 0,
      prospect: session.prospect,
      offer: session.offer,
      successCriteria: session.successCriteria ?? [],
      knownObjections: session.knownObjections ?? [],
      nextAsk: session.nextAsk,
      alignBaseline: session.alignBaseline ?? null,
      finalAlign: session.finalAlign ?? null,
      outcome: session.outcome ?? null,
      tagIds: session.tagIds ?? [],
    })),
    segments: snapshot.segments.map((segment) => ({
      id: segment.id,
      sessionId: segment.sessionId,
      startedAt: segment.startedAt,
      endedAt: segment.endedAt ?? segment.startedAt,
      kind: segment.kind ?? (segment.triggerThatClosedIt === 'closing_cue' ? 'actions' : segment.triggerThatClosedIt === 'drift' ? 'drift' : 'recap'),
      triggerThatFiredIt: segment.triggerThatFiredIt ?? legacyReason(segment.triggerThatClosedIt),
      triggerThatClosedIt: segment.triggerThatClosedIt,
      summary: segment.summary ?? '',
      bullets: segment.bullets ?? [],
      actionItems: segment.actionItems ?? [],
      decisions: segment.decisions ?? [],
      embedding: Array.from(segment.embedding ?? []),
      alignScore: segment.alignScore ?? null,
      driftFromBaseline: segment.driftFromBaseline ?? null,
      llmSteer: segment.llmSteer ?? null,
      wasAccepted: segment.wasAccepted ?? null,
      transcript: segment.transcript,
    })),
    updatedAt: snapshot.updatedAt,
  }
}

function legacyReason(reason: Segment['triggerThatClosedIt'] | undefined): Segment['triggerThatFiredIt'] {
  switch (reason) {
    case 'closing_cue':
      return 'closing_cue'
    case 'topic_shift':
      return 'topic_shift'
    case 'silence':
      return 'silence'
    case 'motion':
      return 'motion'
    case 'manual':
      return 'manual_mark'
    case 'drift':
      return 'drift_breach'
    case 'periodic':
    default:
      return 'tick'
  }
}
