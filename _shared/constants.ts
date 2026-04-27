export const SAMPLE_RATE = 16_000
export const FRAME_BYTES = 40
export const FRAME_MS = 10

export const TICK_MS = 30_000
export const COOLDOWN_MS = 12_000
export const MIN_CONTENT_TOKENS = 40
export const ALIGN_AFTER_MS = 120_000
export const ALIGN_BASELINE_TICKS = 4
export const ALIGN_THRESHOLD = 0.55
export const DRIFT_DELTA = 0.2
export const DRIFT_SUSTAINED_MS = 30_000
export const DRIFT_MUTE_MS = 5 * 60_000
export const SESSION_TIMEBOX_MS = 15 * 60_000
export const CARD_TTL_MS = 12_000
export const SILENCE_PULL_FORWARD_MS = 8_000
export const WRAP_SILENCE_STOP_MS = 30_000
export const GOAL_EMBED_TTL_MS = 90 * 60_000

export const TRANSCRIPT_TAIL_CHARS = 8_000
export const LIVE_TAIL_CHARS = 240
export const CARD_MAX_BULLETS = 5
export const CARD_MAX_BULLET_CHARS = 60
export const MEMORY_CHUNK_CHARS = 48_000
export const MEMORY_ROOT_KEY = 'mm.store'
export const INSTALL_ID_KEY = 'mm.installId'
export const DEFAULT_TRANSCRIPT_RETENTION_DAYS = 30
export const DEMO_PIN_ALLOWED = true
export const DEFAULT_SALES_GOAL = 'Close the next step and confirm buyer commitment.'
export const DEFAULT_SALES_PROSPECT = 'Prospect'
export const DEFAULT_SALES_OFFER = 'MindMirror pilot'
export const DEFAULT_SALES_NEXT_ASK = 'Confirm the next meeting and owner.'

export const DEFAULT_STT_PROVIDER = 'openai'
export const DEFAULT_LLM_PROVIDER = 'openai'
export const DEFAULT_BACKEND_URL = import.meta.env?.VITE_MM_BACKEND_URL || '/api'
