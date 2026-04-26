import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { textContainer } from './containers'
import { progressBar, truncate } from './format'

export function buildHomePage(goal: string, ready = false): CreateStartUpPageContainer {
  const body = [
    '● MindMirror',
    ready ? 'Tap to confirm sales goal' : 'Set sales goal in companion',
    '',
    `Goal: ${truncate(goal, 90)}`,
    '',
    `${progressBar(ready ? 1 : 0)} ${ready ? 'ready' : 'waiting'}`,
    '',
    'Double tap exits',
  ].join('\n')

  return new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [
      textContainer({
        id: 1,
        name: 'home',
        x: 0,
        y: 0,
        w: 576,
        h: 288,
        content: body,
        capture: true,
        padding: 8,
      }),
    ],
    listObject: [],
    imageObject: [],
  })
}

export async function renderHome(
  bridge: EvenAppBridge,
  goal: string,
  mode: 'create' | 'rebuild',
  ready = false,
): Promise<void> {
  const page = buildHomePage(goal, ready)
  if (mode === 'create') {
    await bridge.createStartUpPageContainer(page)
    return
  }
  await bridge.rebuildPageContainer(new RebuildPageContainer(page))
}
