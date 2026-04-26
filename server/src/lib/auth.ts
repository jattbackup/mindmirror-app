import type { IncomingMessage } from 'node:http'

export function getInstallId(req: IncomingMessage): string {
  const header = req.headers['x-mm-install-id']
  if (Array.isArray(header)) return header[0] ?? 'anonymous'
  return header || 'anonymous'
}

export function corsHeaders(origin = '*'): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type,x-mm-install-id',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'vary': 'origin',
  }
}
