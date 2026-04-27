import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { textContainer } from './containers'

export function buildIntroPage(content: string): CreateStartUpPageContainer {
  return new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [
      textContainer({
        id: 1,
        name: 'intro',
        x: 0,
        y: 0,
        w: 576,
        h: 288,
        content,
        capture: true,
        padding: 8,
      }),
    ],
    listObject: [],
    imageObject: [],
  })
}

export async function renderIntroStartup(bridge: EvenAppBridge, content: string): Promise<void> {
  await bridge.createStartUpPageContainer(buildIntroPage(content))
}

export async function rebuildIntro(bridge: EvenAppBridge, content: string): Promise<void> {
  await bridge.rebuildPageContainer(new RebuildPageContainer(buildIntroPage(content)))
}

export async function upgradeIntroFrame(bridge: EvenAppBridge, content: string): Promise<void> {
  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: 1,
    containerName: 'intro',
    contentOffset: 0,
    contentLength: 0,
    content,
  }))
}
