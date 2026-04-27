import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { textContainer } from './containers'
import { truncate } from './format'

export function buildHomePage(goal: string, prospect = 'client', _ready = false): CreateStartUpPageContainer {
  const body = [
    '● MindMirror — Listening',
    `Say "${prospect}" to begin`,
    '',
    `Goal: ${truncate(goal, 90)}`,
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
  prospect: string,
  mode: 'create' | 'rebuild',
): Promise<void> {
  const page = buildHomePage(goal, prospect)
  if (mode === 'create') {
    await bridge.createStartUpPageContainer(page)
    return
  }
  await bridge.rebuildPageContainer(new RebuildPageContainer(page))
}
