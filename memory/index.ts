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
  appendSegment(seg: Segment): Promise<void>
  finaliseSession(sessionId: string, title: string | null): Promise<void>
  search(query: string, k?: number): Promise<SearchHit[]>
  forgetSession(sessionId: string): Promise<void>
  forgetAll(): Promise<void>
  exportEncryptedBlob(): Promise<Blob>
  appendSession?(session: Session): Promise<void>
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
          tagIds: [],
        })
      }
      snapshot.segments = snapshot.segments.filter((existing) => existing.id !== seg.id)
      snapshot.segments.push(serialiseSegment(seg))
      await persist()
    },
    async finaliseSession(sessionId, title) {
      const session = snapshot.sessions.find((item) => item.id === sessionId)
      if (session) {
        session.endedAt = Date.now()
        session.title = title
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
    async appendSession(session) {
      snapshot.sessions = snapshot.sessions.filter((existing) => existing.id !== session.id)
      snapshot.sessions.push(session)
      await persist()
    },
  }
}

async function loadSnapshot(raw: string, passphrase: string): Promise<MemorySnapshot> {
  if (!raw) return emptySnapshot()
  const payload = JSON.parse(raw) as EncryptedPayload
  return decryptJson<MemorySnapshot>(payload, passphrase)
}

function serialiseSegment(seg: Segment): Segment {
  return {
    ...seg,
    embedding: Array.from(seg.embedding as ArrayLike<number>),
    transcript: seg.transcript,
  }
}
