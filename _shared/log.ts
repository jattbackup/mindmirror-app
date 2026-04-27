export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const entries: string[] = []
let consoleRedactionInstalled = false

export function appendEventLog(message: string, level: LogLevel = 'info'): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`
  entries.push(line)
  if (entries.length > 200) entries.shift()
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(`[mindmirror] ${message}`)
}

export function getEventLog(): string[] {
  return [...entries]
}

export function clearEventLog(): void {
  entries.length = 0
}

export function redactRawAudioForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.includes('audioPcm') ? '[redacted audio event]' : value
  }
  if (!value || typeof value !== 'object') return value
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return '[redacted bytes]'
  return redactObject(value as Record<string, unknown>, new WeakSet<object>())
}

export function installConsoleRedaction(): void {
  if (consoleRedactionInstalled) return
  consoleRedactionInstalled = true

  for (const method of ['debug', 'log', 'warn', 'error'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      original(...args.map(redactRawAudioForLog))
    }
  }
}

function redactObject(value: Record<string, unknown>, seen: WeakSet<object>): Record<string, unknown> {
  if (seen.has(value)) return { circular: true }
  seen.add(value)

  const redacted: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'audioPcm') {
      redacted[key] = '[redacted audio]'
    } else if (item instanceof Uint8Array || item instanceof ArrayBuffer) {
      redacted[key] = '[redacted bytes]'
    } else if (item && typeof item === 'object') {
      redacted[key] = redactObject(item as Record<string, unknown>, seen)
    } else {
      redacted[key] = item
    }
  }
  return redacted
}
