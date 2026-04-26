import type { Detector, DetectorContext, DetectorOutput } from './_iface'

export function createMotionProxyDetector(): Detector & { noteAbnormalExit(): void } {
  let abnormalExitAt = 0
  return {
    name: 'motion-proxy',
    noteAbnormalExit() {
      abnormalExitAt = Date.now()
    },
    run(ctx: DetectorContext): DetectorOutput {
      if (abnormalExitAt && ctx.now - abnormalExitAt < 6_000) {
        return { weight: 0.15, reason: 'motion', phaseHint: 'align' }
      }
      return { weight: 0, reason: null }
    },
  }
}
