import { RebuildPageContainer, TextContainerUpgrade, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { LIVE_TAIL_CHARS } from '../../_shared/constants'
import type { G2State } from '../state'
import { textContainer } from './containers'
import { batteryBlocks, formatDuration, progressBar, truncate } from './format'

function buildHeader(state: G2State, now: number): string {
  const elapsed = now - (state.session.startedAt ?? now)
  const timerLine = `● ${formatDuration(elapsed)} / ${formatDuration(state.session.timeboxMs)}  ${batteryBlocks(state.batteryLevel)}`
  const alignLine = state.lastAlignScore != null
    ? `${progressBar(state.lastAlignScore)} ${Math.round(state.lastAlignScore * 100)}% on goal`
    : 'Warmup — alignment starts at 02:00'
  return `${timerLine}\n${alignLine}`
}

export function buildArmedPage(state: G2State, now = Date.now()): RebuildPageContainer {
  const transcript = `${state.finalTranscript}${state.provisionalTranscript}`
  const body = transcript
    ? truncate(transcript.slice(-LIVE_TAIL_CHARS), LIVE_TAIL_CHARS)
    : `Listening...\nGoal: ${truncate(state.session.goal, 100)}`

  return new RebuildPageContainer({
    containerTotalNum: 2,
    textObject: [
      textContainer({
        id: 1,
        name: 'armed-head',
        x: 0,
        y: 0,
        w: 576,
        h: 52,
        content: buildHeader(state, now),
        padding: 4,
      }),
      textContainer({
        id: 2,
        name: 'armed-body',
        x: 0,
        y: 56,
        w: 576,
        h: 232,
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

export async function updateArmedAlign(bridge: EvenAppBridge, state: G2State): Promise<void> {
  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: 1,
    containerName: 'armed-head',
    contentOffset: 0,
    contentLength: 0,
    content: buildHeader(state, Date.now()),
  }))
}
