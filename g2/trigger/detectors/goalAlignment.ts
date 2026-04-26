import {
  ALIGN_AFTER_MS,
  ALIGN_BASELINE_TICKS,
  ALIGN_THRESHOLD,
  DRIFT_DELTA,
  DRIFT_SUSTAINED_MS,
  TICK_MS,
} from '../../../_shared/constants'
import type { GoalContext } from '../index'
import { cosine, lexicalVector } from './embeddingNovelty'

export type GoalAlignmentResult = {
  alignScore: number | null
  baseline: number | null
  driftFromBaseline: number | null
  direction: 'up' | 'down' | 'flat'
  lowAlignSustained: boolean
  driftBreached: boolean
}

export type GoalAlignmentScorer = {
  setGoal(goal: GoalContext): void
  score(text: string, elapsedMs: number, now: number): GoalAlignmentResult
  muteDrift(until: number): void
  getBaseline(): number | null
  getLastAlign(): number | null
  reset(): void
}

const EMPTY_RESULT: GoalAlignmentResult = {
  alignScore: null,
  baseline: null,
  driftFromBaseline: null,
  direction: 'flat',
  lowAlignSustained: false,
  driftBreached: false,
}

export function createGoalAlignmentScorer(): GoalAlignmentScorer {
  let goal: GoalContext | null = null
  let samples: number[] = []
  let baseline: number | null = null
  let lowAlignSince: number | null = null
  let driftSince: number | null = null
  let driftMutedUntil = 0
  let lastAlign: number | null = null

  const minDriftElapsed = ALIGN_AFTER_MS + ALIGN_BASELINE_TICKS * TICK_MS

  return {
    setGoal(nextGoal) {
      goal = nextGoal
      samples = []
      baseline = null
      lowAlignSince = null
      driftSince = null
      driftMutedUntil = 0
      lastAlign = null
    },
    score(text, elapsedMs, now) {
      if (!goal || elapsedMs < ALIGN_AFTER_MS || text.trim().split(/\s+/).filter(Boolean).length < 8) {
        return { ...EMPTY_RESULT, baseline, alignScore: lastAlign }
      }

      const alignScore = Math.max(0, Math.min(1, cosine(Array.from(goal.goalEmbedding), lexicalVector(text, goal.goalEmbedding.length || 384))))
      lastAlign = alignScore
      if (samples.length < ALIGN_BASELINE_TICKS) {
        samples.push(alignScore)
        if (samples.length === ALIGN_BASELINE_TICKS) {
          baseline = samples.reduce((sum, item) => sum + item, 0) / samples.length
        }
      }

      const driftFromBaseline = baseline === null ? null : Math.max(0, baseline - alignScore)
      const direction = baseline === null ? 'flat' : alignScore > baseline + 0.05 ? 'up' : alignScore < baseline - 0.05 ? 'down' : 'flat'

      if (alignScore < ALIGN_THRESHOLD) {
        lowAlignSince ??= now
      } else {
        lowAlignSince = null
      }

      const driftCandidate =
        baseline !== null &&
        driftFromBaseline !== null &&
        driftFromBaseline > DRIFT_DELTA &&
        alignScore < ALIGN_THRESHOLD &&
        elapsedMs >= minDriftElapsed

      if (driftCandidate) {
        driftSince ??= now
      } else {
        driftSince = null
      }

      return {
        alignScore,
        baseline,
        driftFromBaseline,
        direction,
        lowAlignSustained: lowAlignSince !== null && now - lowAlignSince >= 20_000,
        driftBreached: driftSince !== null && now - driftSince >= DRIFT_SUSTAINED_MS && now >= driftMutedUntil,
      }
    },
    muteDrift(until) {
      driftMutedUntil = until
      driftSince = null
    },
    getBaseline() {
      return baseline
    },
    getLastAlign() {
      return lastAlign
    },
    reset() {
      goal = null
      samples = []
      baseline = null
      lowAlignSince = null
      driftSince = null
      driftMutedUntil = 0
      lastAlign = null
    },
  }
}
