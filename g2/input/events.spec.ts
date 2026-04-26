import { describe, expect, it, vi } from 'vitest'
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { createG2Store } from '../state'
import { normalizeEvenHubEvent, routeInputEvent } from './events'

describe('input event normalization', () => {
  it('treats undefined non-audio event type as click', () => {
    expect(normalizeEvenHubEvent({ sysEvent: {} } as unknown as EvenHubEvent).kind).toBe('click')
  })

  it('routes root double-click to host shutdown dialog', async () => {
    const bridge = { shutDownPageContainer: vi.fn(async () => true) } as unknown as EvenAppBridge
    const store = createG2Store()
    await routeInputEvent(bridge, store, { kind: 'double_click' }, fakeHandlers())
    expect(bridge.shutDownPageContainer).toHaveBeenCalledWith(1)
  })
})

function fakeHandlers() {
  return {
    showOnboarding: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    showPreviousCard: vi.fn(),
    dismissCard: vi.fn(),
    saveCard: vi.fn(),
    muteDrift: vi.fn(),
    renderHome: vi.fn(),
    renderArmed: vi.fn(),
    forceMark: vi.fn(),
    cleanup: vi.fn(),
  }
}
