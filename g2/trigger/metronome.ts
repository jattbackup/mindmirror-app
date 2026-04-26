import { TICK_MS } from '../../_shared/constants'

export type Metronome = {
  start(): void
  stop(): void
  reset(): void
  tickNow(): void
}

type TimerId = ReturnType<typeof globalThis.setInterval>

export function createMetronome(opts: {
  onTick(index: number): void
  intervalMs?: number
  setIntervalFn?: (handler: () => void, timeout: number) => TimerId
  clearIntervalFn?: (timer: TimerId) => void
}): Metronome {
  const intervalMs = opts.intervalMs ?? TICK_MS
  const setIntervalFn = opts.setIntervalFn ?? globalThis.setInterval.bind(globalThis)
  const clearIntervalFn = opts.clearIntervalFn ?? globalThis.clearInterval.bind(globalThis)
  let timer: TimerId | null = null
  let index = 0

  const fire = () => {
    index += 1
    opts.onTick(index)
  }

  return {
    start() {
      if (timer !== null) return
      timer = setIntervalFn(fire, intervalMs)
    },
    stop() {
      if (timer === null) return
      clearIntervalFn(timer)
      timer = null
    },
    reset() {
      index = 0
    },
    tickNow() {
      fire()
    },
  }
}
