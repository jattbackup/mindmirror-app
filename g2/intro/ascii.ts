export const MINDMIRROR_ASCII = String.raw`
 __  __ _           _ __  __ _                     
|  \/  (_)_ __   __| |  \/  (_)_ __ _ __ ___  _ __ 
| |\/| | | '_ \ / _' | |\/| | | '__| '__/ _ \| '__|
| |  | | | | | | (_| | |  | | | |  | | | (_) | |   
|_|  |_|_|_| |_|\__,_|_|  |_|_|_|  |_|  \___/|_|   
`.trim()

const FRAME_TEXT_LIMIT = 900

function ensureAscii(value: string): string {
  return value.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
}

function clampFrame(value: string): string {
  return ensureAscii(value).slice(0, FRAME_TEXT_LIMIT)
}

export function buildIntroFrames(ascii: string): string[] {
  const art = ensureAscii(ascii).replace(/\r\n?/g, '\n').trim()
  const lines = art.split('\n').filter((line) => line.length > 0)
  if (lines.length === 0) return ['MindMirror']

  const title = lines[Math.floor(lines.length / 2)]?.trim() || 'MindMirror'
  const firstHalf = lines.slice(0, Math.max(1, Math.ceil(lines.length / 2))).join('\n')
  const full = lines.join('\n')

  return [
    clampFrame(`${title}\n\nSales goal coach`),
    clampFrame(firstHalf),
    clampFrame(`${full}\n\nTap to skip\nDouble tap exits`),
  ]
}
