import type { Detector, DetectorContext, DetectorOutput } from './_iface'

export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function lexicalVector(text: string, dims = 64): number[] {
  const vec = Array.from({ length: dims }, () => 0)
  for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let hash = 0
    for (let i = 0; i < word.length; i++) hash = (hash * 31 + word.charCodeAt(i)) >>> 0
    vec[hash % dims] += 1
  }
  const mag = Math.sqrt(vec.reduce((sum, n) => sum + n * n, 0)) || 1
  return vec.map((n) => n / mag)
}

export function createEmbeddingNoveltyDetector(): Detector {
  let centroid: number[] | null = null
  return {
    name: 'embedding-novelty',
    run(ctx: DetectorContext): DetectorOutput {
      const tail = ctx.finalTail.slice(-1200)
      if (tail.length < 300) return { weight: 0, reason: null }
      const vec = lexicalVector(tail)
      if (!centroid) {
        centroid = vec
        return { weight: 0, reason: null }
      }
      const distance = 1 - cosine(vec, centroid)
      centroid = centroid.map((v, i) => v * 0.85 + vec[i] * 0.15)
      if (distance > 0.55) return { weight: 0.25, reason: 'topic_shift', phaseHint: 'topic_end' }
      return { weight: 0, reason: null }
    },
  }
}
