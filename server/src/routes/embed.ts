import { Buffer } from 'node:buffer'

export type EmbedRequest = {
  texts?: string[]
  text?: string
}

function lexicalVector(text: string, dims = 384): Float32Array {
  const vec = new Float32Array(dims)
  for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let hash = 0
    for (let i = 0; i < word.length; i++) hash = (hash * 31 + word.charCodeAt(i)) >>> 0
    vec[hash % dims] += 1
  }
  let mag = 0
  for (const n of vec) mag += n * n
  mag = Math.sqrt(mag) || 1
  for (let i = 0; i < vec.length; i++) vec[i] /= mag
  return vec
}

export function float32ToBase64(vec: Float32Array): string {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength).toString('base64')
}

export async function embedTexts(req: EmbedRequest): Promise<{ embeddings: string[]; dim: number }> {
  const texts = req.texts ?? (req.text ? [req.text] : [])
  return {
    embeddings: texts.map((text) => float32ToBase64(lexicalVector(text))),
    dim: 384,
  }
}
