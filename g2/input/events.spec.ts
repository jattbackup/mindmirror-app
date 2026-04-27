import { describe, expect, it, vi } from 'vitest'
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { createG2Store } from '../state'
import { normalizeEvenHubEvent, routeInputEvent } from './events'

describe('input event normalization', () => {
  it('treats undefined non-audio event type as click', () => {
    expect(normalizeEvenHubEvent({ sysEvent: {} } as unknown as EvenHubEvent).kind).toBe('click')
  })

  it('routes audio only from audioEvent.audioPcm', () => {
    const pcm = new Uint8Array([1, 2, 3])
    expect(normalizeEvenHubEvent({ audioEvent: { audioPcm: pcm } } as unknown as EvenHubEvent)).toEqual({ kind: 'audio', pcm })
  })

  it('starts in intro', () => {
    expect(createG2Store().getState().screen).toBe('intro')
  })

  it('routes intro double-click to host shutdown dialog', async () => {
    const bridge = { shutDownPageContainer: vi.fn(async () => true) } as unknown as EvenAppBridge
    const store = createG2Store()
    await routeInputEvent(bridge, store, { kind: 'double_click' }, fakeHandlers())
    expect(bridge.shutDownPageContainer).toHaveBeenCalledWith(1)
  })

  it('routes home double-click to host shutdown dialog', async () => {
    const bridge = { shutDownPageContainer: vi.fn(async () => true) } as unknown as EvenAppBridge
    const store = createG2Store()
    store.setState({ screen: 'home' })
    await routeInputEvent(bridge, store, { kind: 'double_click' }, fakeHandlers())
    expect(bridge.shutDownPageContainer).toHaveBeenCalledWith(1)
  })

  it('single tap skips intro', async () => {
    const bridge = {} as unknown as EvenAppBridge
    const handlers = fakeHandlers()
    await routeInputEvent(bridge, createG2Store(), { kind: 'click' }, handlers)
    expect(handlers.skipIntro).toHaveBeenCalledTimes(1)
    expect(handlers.startListening).not.toHaveBeenCalled()
  })

  it('cleans up on system and abnormal exit', async () => {
    const bridge = {} as unknown as EvenAppBridge
    for (const event of [{ kind: 'system_exit' } as const, { kind: 'abnormal_exit' } as const]) {
      const handlers = fakeHandlers()
      await routeInputEvent(bridge, createG2Store(), event, handlers)
      expect(handlers.cleanup).toHaveBeenCalledTimes(1)
    }
  })
})

function fakeHandlers() {
  return {
    skipIntro: vi.fn(),
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
