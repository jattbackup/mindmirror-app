import { MEMORY_CHUNK_CHARS, MEMORY_ROOT_KEY } from '../_shared/constants'

export type StorageBridge = {
  setLocalStorage(key: string, value: string): Promise<boolean>
  getLocalStorage(key: string): Promise<string>
}

export type ChunkStore = {
  read(): Promise<string>
  write(value: string): Promise<void>
  clear(): Promise<void>
}

type Index = {
  keys: string[]
}

export function createMemoryMapBridge(seed = new Map<string, string>()): StorageBridge & { map: Map<string, string> } {
  return {
    map: seed,
    async setLocalStorage(key, value) {
      seed.set(key, value)
      return true
    },
    async getLocalStorage(key) {
      return seed.get(key) ?? ''
    },
  }
}

export function createBridgeChunkStore(
  bridge: StorageBridge | undefined,
  rootKey = MEMORY_ROOT_KEY,
): ChunkStore {
  const fallback = createMemoryMapBridge()
  const storage = bridge ?? fallback
  const indexKey = `${rootKey}.index`

  return {
    async read() {
      const rawIndex = await storage.getLocalStorage(indexKey)
      if (!rawIndex) return ''
      const index = JSON.parse(rawIndex) as Index
      const chunks = await Promise.all(index.keys.map((key) => storage.getLocalStorage(key)))
      return chunks.join('')
    },
    async write(value) {
      const oldIndexRaw = await storage.getLocalStorage(indexKey)
      const oldIndex = oldIndexRaw ? (JSON.parse(oldIndexRaw) as Index) : { keys: [] }
      for (const key of oldIndex.keys) await storage.setLocalStorage(key, '')

      const keys: string[] = []
      const chunks = Math.max(1, Math.ceil(value.length / MEMORY_CHUNK_CHARS))
      for (let i = 0; i < chunks; i++) {
        const key = `${rootKey}.${i}`
        keys.push(key)
        await storage.setLocalStorage(key, value.slice(i * MEMORY_CHUNK_CHARS, (i + 1) * MEMORY_CHUNK_CHARS))
      }
      await storage.setLocalStorage(indexKey, JSON.stringify({ keys }))
    },
    async clear() {
      const rawIndex = await storage.getLocalStorage(indexKey)
      if (rawIndex) {
        const index = JSON.parse(rawIndex) as Index
        for (const key of index.keys) await storage.setLocalStorage(key, '')
      }
      await storage.setLocalStorage(indexKey, '')
    },
  }
}
