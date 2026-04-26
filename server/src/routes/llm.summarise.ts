export type SummariseRequest = {
  transcriptTail: string
  phase: 'mid' | 'topic_end' | 'wrap'
  priorSummaries?: string[]
  style?: 'bullets' | 'actions' | 'probe'
}

export type SummariseResponse = {
  title: string
  bullets: string[]
  actionItems: Array<{ who: string | null; what: string; due: string | null }>
  decisions: string[]
  tokensIn: number
  tokensOut: number
  phase?: 'mid' | 'topic_end' | 'wrap'
  confidence?: number
  drift_explanation?: string
}

function cap(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`
}

function localSummarise(req: SummariseRequest): SummariseResponse {
  const sentences = req.transcriptTail
    .split(/[.!?\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 12)
  const bullets = sentences.slice(-5).map((line) => cap(line, 60))
  const actionItems = bullets
    .filter((line) => /\b(send|review|draft|spec|decide|follow|ship|defer)\b/i.test(line))
    .map((what) => ({ who: null, what, due: null }))
  return {
    title: req.phase === 'wrap' ? 'Final actions' : req.phase === 'topic_end' ? 'Just covered' : 'Recap',
    bullets: bullets.length ? bullets : ['No stable summary yet'],
    actionItems,
    decisions: req.phase === 'wrap' ? bullets : [],
    tokensIn: req.transcriptTail.split(/\s+/).filter(Boolean).length,
    tokensOut: bullets.join(' ').split(/\s+/).filter(Boolean).length,
    phase: req.phase,
    confidence: req.style === 'probe' ? 0.55 : undefined,
  }
}

export async function summarise(req: SummariseRequest): Promise<SummariseResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return localSummarise(req)

  const prompt = [
    'You are MindMirror, an embedded summariser running on smart glasses.',
    'Return valid JSON with title, bullets, actionItems, decisions.',
    'No prose outside JSON. No emoji. <=5 bullets. <=60 chars each.',
  ].join('\n')

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
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify(req) },
      ],
      temperature: 0.2,
    }),
  })

  if (!response.ok) return localSummarise(req)
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } }
  const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}') as Partial<SummariseResponse>
  const fallback = localSummarise(req)
  return {
    title: cap(parsed.title ?? fallback.title, 60),
    bullets: (parsed.bullets ?? fallback.bullets).slice(0, 5).map((item) => cap(item, 60)),
    actionItems: (parsed.actionItems ?? fallback.actionItems).slice(0, 5),
    decisions: (parsed.decisions ?? fallback.decisions).slice(0, 5).map((item) => cap(item, 120)),
    tokensIn: json.usage?.prompt_tokens ?? fallback.tokensIn,
    tokensOut: json.usage?.completion_tokens ?? fallback.tokensOut,
    phase: parsed.phase,
    confidence: parsed.confidence,
    drift_explanation: parsed.drift_explanation,
  }
}
