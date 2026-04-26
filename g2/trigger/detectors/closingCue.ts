import type { Detector, DetectorContext, DetectorOutput } from './_iface'

const CLOSING_RE = /\b(alright|ok|okay|so|great|cool)\b.{0,24}\b(wrap|good|done|that's it|bye|talk soon|ttyl|see you|let's call it|call it)\b/i
const HARD_NEGATIVE_RE = /\b(wait|actually wait|not done|not good|hold on|one more|before we wrap)\b/i

export function closingCueHit(text: string): boolean {
  return CLOSING_RE.test(text) && !HARD_NEGATIVE_RE.test(text)
}

export const closingCueDetector: Detector = {
  name: 'closing-cue',
  run(ctx: DetectorContext): DetectorOutput {
    if (!ctx.finalTail.trim()) return { weight: 0, reason: null }
    const tail = ctx.finalTail.slice(-500)
    if (!closingCueHit(tail)) return { weight: 0, reason: null }
    return { weight: 0.9, reason: 'closing_cue', phaseHint: 'wrap' }
  },
}
