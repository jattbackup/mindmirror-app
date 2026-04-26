import { RebuildPageContainer, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { SearchHit } from '../../memory'
import { textContainer } from './containers'
import { truncate } from './format'

export function buildRecallPage(hits: SearchHit[]): RebuildPageContainer {
  const body = hits.length
    ? hits.slice(0, 5).map((hit, idx) => `${idx + 1}. ${truncate(hit.snippet, 95)} (${hit.score.toFixed(2)})`).join('\n\n')
    : 'No memory hits yet.'

  return new RebuildPageContainer({
    containerTotalNum: 2,
    textObject: [
      textContainer({
        id: 1,
        name: 'recall-head',
        x: 0,
        y: 0,
        w: 576,
        h: 36,
        content: '● Memory recall',
        padding: 4,
      }),
      textContainer({
        id: 2,
        name: 'recall-body',
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

export async function renderRecall(bridge: EvenAppBridge, hits: SearchHit[]): Promise<void> {
  await bridge.rebuildPageContainer(buildRecallPage(hits))
}
