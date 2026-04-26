import fs from 'node:fs/promises'
import path from 'node:path'

export type SummariseRequest = {
  transcriptTail: string
  phase: 'warmup' | 'align' | 'drift' | 'wrap'
  goal?: string
  priorSummaries?: string[]
  alignScore?: number | null
  driftFromBaseline?: number | null
  style?: 'recap' | 'drift' | 'actions'
}

export type SummariseResponse = {
  title: string
  bullets: string[]
  actionItems: Array<{ who: string | null; what: string; due: string | null }>
  decisions: string[]
  steer: string | null
  tokensIn: number
  tokensOut: number
}

function cap(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 12)
}

function localSummarise(req: SummariseRequest): SummariseResponse {
  const lines = sentences(req.transcriptTail)
  const goal = cap(req.goal || 'the close goal', 80)
  const latest = lines.slice(-5)
  const style = req.style ?? (req.phase === 'wrap' ? 'actions' : 'recap')
  const bullets = latest.length
    ? latest.map((line) => cap(line, 60))
    : [`Toward close: ${cap(goal, 44)}`]

  if (style === 'drift') {
    const offTopic = cap(latest.at(-1) ?? 'the last exchange moved off the close path', 52)
    const steer = cap(`Let's return to ${goal} and confirm the next step.`, 80)
    return {
      title: 'Drift alert',
      bullets: [`Last topic: ${offTopic}`],
      actionItems: [],
      decisions: [],
      steer,
      tokensIn: req.transcriptTail.split(/\s+/).filter(Boolean).length,
      tokensOut: steer.split(/\s+/).filter(Boolean).length,
    }
  }

  const actionItems = bullets
    .filter((line) => /\b(send|review|draft|spec|decide|follow|ship|defer|confirm|schedule|introduce|pilot|contract)\b/i.test(line))
    .slice(0, 5)
    .map((what) => ({ who: ownerFrom(what), what, due: dueFrom(what) }))

  return {
    title: style === 'actions' ? 'Close actions' : req.phase === 'warmup' ? 'Sales warmup' : 'Toward close',
    bullets: bullets.slice(0, 5),
    actionItems,
    decisions: style === 'actions' ? bullets.slice(0, 5) : [],
    steer: null,
    tokensIn: req.transcriptTail.split(/\s+/).filter(Boolean).length,
    tokensOut: bullets.join(' ').split(/\s+/).filter(Boolean).length,
  }
}

function ownerFrom(text: string): string | null {
  const match = text.match(/\b([A-Z][a-z]+)\b(?=.*\b(send|review|draft|spec|confirm|schedule|own|follow)\b)/)
  return match?.[1] ?? null
}

function dueFrom(text: string): string | null {
  const match = text.match(/\b(by|on)\s+([A-Z]?[a-z]+day|tomorrow|today|next week|Friday|Monday|Tuesday|Wednesday|Thursday)\b/i)
  return match ? match[2] : null
}

async function promptText(): Promise<string> {
  try {
    return await fs.readFile(path.join(process.cwd(), 'src/prompts/summarise.md'), 'utf8')
  } catch {
    return [
      'You are MindMirror, a sales close coach on smart glasses.',
      'Return valid JSON with title, bullets, actionItems, decisions, steer.',
      'No prose outside JSON. No emoji. <=5 bullets. <=60 chars each.',
    ].join('\n')
  }
}

export async function summarise(req: SummariseRequest): Promise<SummariseResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  const fallback = localSummarise(req)
  if (!apiKey) return fallback

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: await promptText() },
        { role: 'user', content: JSON.stringify(req) },
      ],
      temperature: 0.2,
    }),
  })

  if (!response.ok) return fallback
  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}') as Partial<SummariseResponse>
  return {
    title: cap(parsed.title ?? fallback.title, 60),
    bullets: (parsed.bullets ?? fallback.bullets).slice(0, 5).map((item) => cap(item, 60)),
    actionItems: (parsed.actionItems ?? fallback.actionItems).slice(0, 5),
    decisions: (parsed.decisions ?? fallback.decisions).slice(0, 5).map((item) => cap(item, 120)),
    steer: parsed.steer ? cap(parsed.steer, 80) : fallback.steer,
    tokensIn: json.usage?.prompt_tokens ?? fallback.tokensIn,
    tokensOut: json.usage?.completion_tokens ?? fallback.tokensOut,
  }
}
