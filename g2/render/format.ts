import { CARD_MAX_BULLET_CHARS, CARD_MAX_BULLETS } from '../../_shared/constants'

export function truncate(text: string, max: number): string {
  const clean = cleanForG2(text)
  if (clean.length <= max) return clean
  if (max <= 3) return clean.slice(0, max)
  return `${clean.slice(0, max - 3)}...`
}

export function cleanForG2(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function wrapLine(text: string, max = CARD_MAX_BULLET_CHARS): string[] {
  const words = cleanForG2(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    if (!line) {
      line = word
      continue
    }
    if (`${line} ${word}`.length <= max) {
      line = `${line} ${word}`
    } else {
      lines.push(line)
      line = word
    }
  }

  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export function formatBullets(bullets: string[], maxBullets = CARD_MAX_BULLETS): string {
  return bullets
    .slice(0, maxBullets)
    .map((bullet) => `- ${truncate(bullet, CARD_MAX_BULLET_CHARS)}`)
    .join('\n')
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function progressBar(value: number, width = 10): string {
  const clamped = Math.max(0, Math.min(1, value))
  const filled = Math.round(clamped * width)
  return `${'━'.repeat(filled)}${'─'.repeat(width - filled)}`
}

export function batteryBlocks(level: number | null): string {
  if (level === null) return '▁▁▁▁'
  const blocks = Math.max(0, Math.min(4, Math.ceil(level / 25)))
  return `${'▆'.repeat(blocks)}${'▁'.repeat(4 - blocks)}`
}
