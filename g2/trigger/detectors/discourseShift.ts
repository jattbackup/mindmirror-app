import type { Detector, DetectorContext, DetectorOutput } from './_iface'

const MARKER_RE = /\b(so|anyway|next|moving on|switching gears|on another note|now)\b[:, ]/i

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3),
  )
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection++
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : intersection / union
}

export const discourseShiftDetector: Detector = {
  name: 'discourse-shift',
  run(ctx: DetectorContext): DetectorOutput {
    const tail = ctx.finalTail.trim()
    if (tail.length < 240 || !MARKER_RE.test(tail.slice(-160))) return { weight: 0, reason: null }
    const midpoint = Math.max(0, tail.length - 360)
    const prev = tail.slice(midpoint, Math.max(midpoint, tail.length - 120))
    const next = tail.slice(-120)
    const score = jaccard(words(prev), words(next))
    if (score < 0.15) return { weight: 0.35, reason: 'topic_shift', phaseHint: 'align' }
    return { weight: 0, reason: null }
  },
}
