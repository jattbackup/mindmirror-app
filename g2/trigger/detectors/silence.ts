import { SILENCE_PULL_FORWARD_MS } from '../../../_shared/constants'
import type { Detector, DetectorContext, DetectorOutput } from './_iface'

export const silenceDetector: Detector = {
  name: 'silence',
  run(ctx: DetectorContext): DetectorOutput {
    if (ctx.silenceMs >= SILENCE_PULL_FORWARD_MS) {
      return { weight: 0.3, reason: 'silence', phaseHint: 'topic_end' }
    }
    return { weight: 0, reason: null }
  },
}
