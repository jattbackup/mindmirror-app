import { COOLDOWN_MS } from '../../_shared/constants'
import type { TriggerEvent } from './index'

const PRIORITY: Record<TriggerEvent['reason'], number> = {
  closing_cue: 5,
  drift: 4,
  topic_shift: 3,
  silence: 2,
  motion: 2,
  manual: 2,
  periodic: 1,
}

export function canSurface(opts: {
  now: number
  lastSurfaceAt: number
  lastReason: TriggerEvent['reason'] | null
  nextReason: TriggerEvent['reason']
  cooldownMs?: number
}): boolean {
  if (!opts.lastSurfaceAt) return true
  const elapsed = opts.now - opts.lastSurfaceAt
  if (elapsed >= (opts.cooldownMs ?? COOLDOWN_MS)) return true
  if (!opts.lastReason) return false
  return PRIORITY[opts.nextReason] > PRIORITY[opts.lastReason]
}
