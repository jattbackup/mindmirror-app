import { ALIGN_THRESHOLD, DRIFT_DELTA } from '../../_shared/constants'
import type { DetectorOutput } from './detectors/_iface'
import type { Phase, TriggerEvent, TriggerReason } from './index'

export function fuse(outputs: DetectorOutput[]): Pick<TriggerEvent, 'reason' | 'phase'> & { score: number } | null {
  let score = 0
  let reason: TriggerReason | null = null
  let phase: Phase = 'align'

  for (const output of outputs) {
    if (!output.reason) continue
    score += output.weight
    if (!reason || output.weight > 0.3) reason = output.reason
    if (output.phaseHint) phase = output.phaseHint
  }

  if (!reason || score < 0.3) return null
  return { reason, phase, score: Math.min(1, score) }
}

export function alignmentDirection(score: number, baseline: number | null): 'up' | 'down' | 'flat' {
  if (baseline === null) return 'flat'
  if (score > baseline + 0.05) return 'up'
  if (score < baseline - 0.05) return 'down'
  return 'flat'
}

export function driftBreached(score: number, baseline: number | null): boolean {
  return score < ALIGN_THRESHOLD && baseline !== null && baseline - score > DRIFT_DELTA
}
