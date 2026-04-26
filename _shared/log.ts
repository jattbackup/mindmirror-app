export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const entries: string[] = []

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
