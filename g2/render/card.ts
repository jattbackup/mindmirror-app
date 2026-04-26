import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { CARD_MAX_BULLETS } from '../../_shared/constants'
import { textContainer } from './containers'
import { formatBullets, progressBar, truncate } from './format'

export type CardKind = 'recap' | 'drift' | 'actions' | 'memory-hit'

export type CardModel = {
  kind: CardKind
  title: string
  bullets: string[]
  footerHint?: string
  alignment?: number
  driftDirection?: 'up' | 'down' | 'flat'
  tickIndex?: number
  ts?: number
}

function headerFor(card: CardModel): string {
  const glyph = card.kind === 'drift' ? '◆' : card.kind === 'actions' ? '■' : '●'
  const align = typeof card.alignment === 'number'
    ? ` align ${card.alignment.toFixed(2)} ${card.driftDirection === 'down' ? '▼' : card.driftDirection === 'up' ? '▲' : '-'}`
    : ''
  const tick = card.tickIndex ? ` #${card.tickIndex}` : ''
  return truncate(`${glyph} ${card.title}${tick}${align}`, 120)
}

function bodyFor(card: CardModel): string {
  if (card.kind === 'drift') {
    const steer = card.bullets[0] ?? 'Steer back toward the stated goal.'
    return `Drift detected\n\n> ${truncate(steer, 180)}\n\n${progressBar(card.alignment ?? 0)}`
  }
  return formatBullets(card.bullets, CARD_MAX_BULLETS)
}

function buildCardPage(card: CardModel): CreateStartUpPageContainer {
  const footer = truncate(card.footerHint ?? '▲ prev  ● save  ▼ dismiss', 120)
  return new CreateStartUpPageContainer({
    containerTotalNum: 3,
    textObject: [
      textContainer({
        id: 1,
        name: 'card-head',
        x: 0,
        y: 0,
        w: 576,
        h: 36,
        content: headerFor(card),
        padding: 4,
      }),
      textContainer({
        id: 2,
        name: 'card-body',
        x: 0,
        y: 40,
        w: 576,
        h: 208,
        content: bodyFor(card),
        capture: true,
        padding: 6,
      }),
      textContainer({
        id: 3,
        name: 'card-foot',
        x: 0,
        y: 252,
        w: 576,
        h: 36,
        content: footer,
        padding: 4,
      }),
    ],
    listObject: [],
    imageObject: [],
  })
}

export async function renderCard(
  bridge: EvenAppBridge,
  card: CardModel,
  mode: 'create' | 'rebuild' | 'upgrade',
): Promise<void> {
  if (mode === 'upgrade') {
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 1,
      containerName: 'card-head',
      contentOffset: 0,
      contentLength: 0,
      content: headerFor(card),
    }))
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 2,
      containerName: 'card-body',
      contentOffset: 0,
      contentLength: 0,
      content: bodyFor(card),
    }))
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 3,
      containerName: 'card-foot',
      contentOffset: 0,
      contentLength: 0,
      content: truncate(card.footerHint ?? '▲ prev  ● save  ▼ dismiss', 120),
    }))
    return
  }

  const page = buildCardPage(card)
  if (mode === 'create') {
    await bridge.createStartUpPageContainer(page)
  } else {
    await bridge.rebuildPageContainer(new RebuildPageContainer(page))
  }
}
