import { RebuildPageContainer, TextContainerUpgrade, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { LIVE_TAIL_CHARS } from '../../_shared/constants'
import type { G2State } from '../state'
import { textContainer } from './containers'
import { batteryBlocks, formatDuration, truncate } from './format'

export function buildArmedPage(state: G2State, now = Date.now()): RebuildPageContainer {
  const startedAt = state.session.startedAt ?? now
  const elapsed = now - startedAt
  const header = [
    `● ${formatDuration(elapsed)} / ${formatDuration(state.session.timeboxMs)}`,
    `${batteryBlocks(state.batteryLevel)} armed`,
  ].join('  ')
  const transcript = `${state.finalTranscript}${state.provisionalTranscript}`
  const body = transcript
    ? truncate(transcript.slice(-LIVE_TAIL_CHARS), LIVE_TAIL_CHARS)
    : `Listening...\nClose goal: ${truncate(state.session.goal, 120)}\nAlignment starts after 02:00.`

  return new RebuildPageContainer({
    containerTotalNum: 2,
    textObject: [
      textContainer({
        id: 1,
        name: 'armed-head',
        x: 0,
        y: 0,
        w: 576,
        h: 36,
        content: header,
        padding: 4,
      }),
      textContainer({
        id: 2,
        name: 'armed-body',
        x: 0,
        y: 40,
        w: 576,
        h: 248,
        content: body,
        capture: true,
        padding: 6,
      }),
    ],
    listObject: [],
    imageObject: [],
  })
}

export async function renderArmed(bridge: EvenAppBridge, state: G2State): Promise<void> {
  await bridge.rebuildPageContainer(buildArmedPage(state))
}

export async function updateArmedText(bridge: EvenAppBridge, state: G2State): Promise<void> {
  const transcript = `${state.finalTranscript}${state.provisionalTranscript}`
  const content = transcript ? truncate(transcript.slice(-LIVE_TAIL_CHARS), LIVE_TAIL_CHARS) : 'Listening...'
  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: 2,
    containerName: 'armed-body',
    contentOffset: 0,
    contentLength: 0,
    content,
  }))
}
