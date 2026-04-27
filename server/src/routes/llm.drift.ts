export type DriftCoachRequest = {
  transcriptTail: string
  goal: string
}

export type DriftCoachResponse = {
  alert: string
  strategy: string
  bridgeScript: string
}

function cap(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`
}

function localFallback(req: DriftCoachRequest): DriftCoachResponse {
  return {
    alert: cap(`Conversation drifted from: ${req.goal}`, 60),
    strategy: 'Off-topic talk burns time and loses deal momentum.',
    bridgeScript: cap(`To stay on track — shall we return to ${req.goal}?`, 80),
  }
}

const SYSTEM_PROMPT = [
  'You are MindMirror, a real-time AR sales coach on smart glasses.',
  'The user\'s conversation has drifted from their sales goal.',
  'Return ONLY valid JSON with exactly three fields:',
  '  "alert": what the drift is (max 60 chars, no quotes inside)',
  '  "strategy": why this is dangerous for the deal (max 60 chars)',
  '  "bridgeScript": a polite 1-sentence pivot back to goal (max 80 chars)',
  'No emoji. No prose outside JSON. Be supportive, not judgmental.',
  'Focus on "Time vs. Value." User reads this in AR glasses — be concise.',
].join('\n')

export async function driftCoach(req: DriftCoachRequest): Promise<DriftCoachResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return localFallback(req)

  try {
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
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Goal: ${req.goal}\n\nRecent transcript:\n${req.transcriptTail.slice(-800)}\n\nDrift detected. Generate the intervention.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
    })

    if (!response.ok) return localFallback(req)
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}') as Partial<DriftCoachResponse>
    return {
      alert: parsed.alert ? cap(parsed.alert, 60) : localFallback(req).alert,
      strategy: parsed.strategy ? cap(parsed.strategy, 60) : localFallback(req).strategy,
      bridgeScript: parsed.bridgeScript ? cap(parsed.bridgeScript, 80) : localFallback(req).bridgeScript,
    }
  } catch {
    return localFallback(req)
  }
}
