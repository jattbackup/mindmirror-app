import { COOLDOWN_MS } from '../../_shared/constants'
import type { TriggerReason } from './index'

const PRIORITY: Record<TriggerReason, number> = {
  closing_cue: 5,
  drift_breach: 4,
  topic_shift: 3,
  silence: 2,
  motion: 2,
  manual_mark: 2,
  tick: 1,
}

export function canSurface(opts: {
  now: number
  lastSurfaceAt: number
  lastReason: TriggerReason | null
  nextReason: TriggerReason
  cooldownMs?: number
}): boolean {
  if (opts.nextReason === 'closing_cue' || opts.nextReason === 'drift_breach') return true
  if (!opts.lastSurfaceAt) return true
  const elapsed = opts.now - opts.lastSurfaceAt
  if (elapsed >= (opts.cooldownMs ?? COOLDOWN_MS)) return true
  if (!opts.lastReason) return false
  return PRIORITY[opts.nextReason] > PRIORITY[opts.lastReason]
}
