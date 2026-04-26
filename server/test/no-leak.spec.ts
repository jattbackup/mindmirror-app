import { describe, expect, it, vi } from 'vitest'
import { summarise } from '../src/routes/llm.summarise.js'
import { redact, safeLog } from '../src/lib/redact.js'

describe('server no-leak policy', () => {
  it('redacts canary markers from logs', () => {
    expect(redact('hello MINDMIRROR_LEAK_CANARY')).not.toContain('MINDMIRROR_LEAK_CANARY')
  })

  it('does not log transcript bodies', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    safeLog('route', { transcriptTail: 'MINDMIRROR_LEAK_CANARY' })
    expect(spy.mock.calls.flat().join(' ')).not.toContain('MINDMIRROR_LEAK_CANARY')
    spy.mockRestore()
  })

  it('allows explicit summary response to contain derived content only', async () => {
    const response = await summarise({
      transcriptTail: 'MINDMIRROR_LEAK_CANARY was the marker. Dana will send the API schema by Friday.',
      phase: 'wrap',
      priorSummaries: [],
      style: 'actions',
    })
    expect(response.bullets.join(' ')).toContain('Dana')
  })
})
