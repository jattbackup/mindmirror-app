import { SESSION_TIMEBOX_MS } from '../../_shared/constants'

export type TimeboxState = {
  elapsedMs: number
  remainingMs: number
  isExpired: boolean
  fiveMinuteWarning: boolean
}

export function getTimeboxState(startedAt: number | null, now = Date.now(), timeboxMs = SESSION_TIMEBOX_MS): TimeboxState {
  const elapsedMs = startedAt === null ? 0 : Math.max(0, now - startedAt)
  const remainingMs = Math.max(0, timeboxMs - elapsedMs)
  return {
    elapsedMs,
    remainingMs,
    isExpired: elapsedMs >= timeboxMs,
    fiveMinuteWarning: remainingMs <= 5 * 60_000 && remainingMs > 0,
  }
}
