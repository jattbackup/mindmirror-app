import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function loadServerEnv(cwd = process.cwd()): void {
  const path = resolve(cwd, '.env')
  if (!existsSync(path)) return

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue

    const key = line.slice(0, index).trim()
    const value = unquote(line.slice(index + 1).trim())
    if (!process.env[key]) process.env[key] = value
  }
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}
