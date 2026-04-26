import { RebuildPageContainer, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { textContainer } from './containers'
import { truncate } from './format'

export type FinalisingModel = {
  segments: number
  outcome: 'completed' | 'abandoned' | 'timeboxed'
  message?: string
}

export function buildFinalisingPage(model: FinalisingModel): RebuildPageContainer {
  const body = [
    `saving ${model.segments} segments`,
    'encrypting memory',
    `outcome: ${model.outcome}`,
    truncate(model.message ?? 'done', 90),
  ].join('\n')

  return new RebuildPageContainer({
    containerTotalNum: 2,
    textObject: [
      textContainer({
        id: 1,
        name: 'final-head',
        x: 0,
        y: 0,
        w: 576,
        h: 40,
        content: '■ Finalising session',
        padding: 4,
      }),
      textContainer({
        id: 2,
        name: 'final-body',
        x: 0,
        y: 44,
        w: 576,
        h: 244,
        content: body,
        capture: true,
        padding: 6,
      }),
    ],
    listObject: [],
    imageObject: [],
  })
}

export async function renderFinalising(bridge: EvenAppBridge, model: FinalisingModel): Promise<void> {
  await bridge.rebuildPageContainer(buildFinalisingPage(model))
}
