import type { Phase } from '../index'

export type LlmGateResult = {
  phase: Phase
  confidence: number
  drift_explanation?: string
}

export async function probePhase(opts: {
  backendUrl: string
  installId: string
  transcriptTail: string
}): Promise<LlmGateResult | null> {
  const response = await fetch(`${opts.backendUrl.replace(/\/$/, '')}/llm/summarise`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mm-install-id': opts.installId,
    },
      body: JSON.stringify({
        transcriptTail: opts.transcriptTail.slice(-3000),
        phase: 'align',
        goal: '',
        priorSummaries: [],
        style: 'recap',
      }),
  })
  if (!response.ok) return null
  const json = await response.json()
  return {
    phase: json.phase ?? 'align',
    confidence: Number(json.confidence ?? 0),
    drift_explanation: json.drift_explanation,
  }
}
