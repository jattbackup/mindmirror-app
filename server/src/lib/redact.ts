const SECRET_PATTERNS = [
  /MINDMIRROR_LEAK_CANARY/g,
  /transcriptTail"\s*:\s*"[^"]+"/g,
  /summary"\s*:\s*"[^"]+"/g,
  /OPENAI_API_KEY=[^\s]+/g,
  /SONIOX_API_KEY=[^\s]+/g,
]

export function redact(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value)
}

export function safeLog(message: string, meta: Record<string, unknown> = {}): void {
  const cleaned = Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (/transcript|summary|audio|prompt/i.test(key)) return [key, '[REDACTED]']
      return [key, typeof value === 'string' ? redact(value) : value]
    }),
  )
  console.log(`[mindmirror-server] ${redact(message)}`, cleaned)
}
