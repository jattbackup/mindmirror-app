import type { Phase, TriggerEvent } from '../index'

export type DetectorContext = {
  now: number
  silenceMs: number
  finalTail: string
  provisional: string
  isWearing: boolean
  sinceLastSurfaceMs: number
}

export type DetectorOutput = {
  weight: number
  reason: TriggerEvent['reason'] | null
  phaseHint?: Phase
}

export interface Detector {
  name: string
  run(ctx: DetectorContext): Promise<DetectorOutput> | DetectorOutput
}
