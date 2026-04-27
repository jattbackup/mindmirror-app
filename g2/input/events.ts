import { OsEventTypeList, type EvenAppBridge, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import type { G2Store, Screen } from '../state'

export type NormalizedEvent =
  | { kind: 'audio'; pcm: Uint8Array }
  | { kind: 'click' }
  | { kind: 'double_click' }
  | { kind: 'scroll_top' }
  | { kind: 'scroll_bottom' }
  | { kind: 'foreground_enter' }
  | { kind: 'foreground_exit' }
  | { kind: 'abnormal_exit' }
  | { kind: 'system_exit' }
  | { kind: 'imu'; x?: number; y?: number; z?: number }
  | { kind: 'unknown' }

function rawEventType(event: EvenHubEvent): unknown {
  const raw = (event.jsonData ?? {}) as Record<string, unknown>
  return (
    event.listEvent?.eventType ??
    event.textEvent?.eventType ??
    event.sysEvent?.eventType ??
    (event as Record<string, unknown>).eventType ??
    raw.eventType ??
    raw.event_type ??
    raw.Event_Type ??
    raw.type
  )
}

function typeFromRaw(raw: unknown): number | undefined {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const value = raw.toUpperCase()
    if (value.includes('DOUBLE')) return OsEventTypeList.DOUBLE_CLICK_EVENT
    if (value.includes('SCROLL_TOP') || value === 'UP') return OsEventTypeList.SCROLL_TOP_EVENT
    if (value.includes('SCROLL_BOTTOM') || value === 'DOWN') return OsEventTypeList.SCROLL_BOTTOM_EVENT
    if (value.includes('FOREGROUND_ENTER')) return OsEventTypeList.FOREGROUND_ENTER_EVENT
    if (value.includes('FOREGROUND_EXIT')) return OsEventTypeList.FOREGROUND_EXIT_EVENT
    if (value.includes('ABNORMAL')) return OsEventTypeList.ABNORMAL_EXIT_EVENT
    if (value.includes('SYSTEM_EXIT')) return 7
    if (value.includes('IMU')) return OsEventTypeList.IMU_DATA_REPORT
    if (value.includes('CLICK')) return OsEventTypeList.CLICK_EVENT
  }
  return undefined
}

export function normalizeEvenHubEvent(event: EvenHubEvent): NormalizedEvent {
  if (event.audioEvent?.audioPcm) return { kind: 'audio', pcm: event.audioEvent.audioPcm }

  const type = typeFromRaw(rawEventType(event))
  const hasNonAudio = Boolean(event.listEvent || event.textEvent || event.sysEvent || event.jsonData)

  if (event.sysEvent?.imuData || type === OsEventTypeList.IMU_DATA_REPORT) {
    const imu = event.sysEvent?.imuData
    return { kind: 'imu', x: imu?.x, y: imu?.y, z: imu?.z }
  }

  switch (type) {
    case OsEventTypeList.CLICK_EVENT:
      return { kind: 'click' }
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return { kind: 'double_click' }
    case OsEventTypeList.SCROLL_TOP_EVENT:
      return { kind: 'scroll_top' }
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      return { kind: 'scroll_bottom' }
    case OsEventTypeList.FOREGROUND_ENTER_EVENT:
      return { kind: 'foreground_enter' }
    case OsEventTypeList.FOREGROUND_EXIT_EVENT:
      return { kind: 'foreground_exit' }
    case OsEventTypeList.ABNORMAL_EXIT_EVENT:
      return { kind: 'abnormal_exit' }
    case 7:
      return { kind: 'system_exit' }
    default:
      return hasNonAudio ? { kind: 'click' } : { kind: 'unknown' }
  }
}

export type InputHandlers = {
  skipIntro(): Promise<void>
  startListening(): Promise<void>
  stopListening(finalise?: boolean): Promise<void>
  showPreviousCard(): Promise<void>
  dismissCard(): Promise<void>
  saveCard(): Promise<void>
  muteDrift(): void
  renderHome(): Promise<void>
  renderArmed(): Promise<void>
  forceMark(): void
  cleanup(): Promise<void>
}

export async function routeInputEvent(
  bridge: EvenAppBridge,
  store: G2Store,
  event: NormalizedEvent,
  handlers: InputHandlers,
): Promise<void> {
  const screen: Screen = store.getState().screen

  if (event.kind === 'foreground_enter') {
    if (screen !== 'intro' && !store.getState().isRecording) {
      await handlers.startListening()
    }
    return
  }

  if (event.kind === 'foreground_exit') return
  if (event.kind === 'abnormal_exit' || event.kind === 'system_exit') {
    await handlers.cleanup()
    return
  }

  if (event.kind === 'double_click') {
    if (screen === 'intro' || screen === 'home') {
      await bridge.shutDownPageContainer(1)
      return
    }
    if (screen === 'card' || screen === 'recall') {
      await handlers.dismissCard()
      return
    }
    store.setState({ screen: 'home', previousScreen: screen })
    await handlers.renderHome()
    return
  }

  if (event.kind === 'click') {
    if (screen === 'intro') {
      await handlers.skipIntro()
    } else if (screen === 'home') {
      await handlers.startListening()
    } else if (screen === 'armed') {
      handlers.forceMark()
    } else if (screen === 'card') {
      await handlers.saveCard()
    }
    return
  }

  if (screen === 'card' && event.kind === 'scroll_top') {
    await handlers.showPreviousCard()
  } else if (screen === 'card' && event.kind === 'scroll_bottom') {
    if (store.getState().currentCard?.kind === 'drift') handlers.muteDrift()
    await handlers.dismissCard()
  }
}
