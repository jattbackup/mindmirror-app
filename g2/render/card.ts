import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { CARD_MAX_BULLETS } from '../../_shared/constants'
import { textContainer } from './containers'
import { formatBullets, formatDuration, progressBar, truncate } from './format'

export type CardKind = 'recap' | 'drift' | 'actions' | 'memory-hit'

export type CardModel = {
  kind: CardKind
  title: string
  bullets: string[]
  steer?: string
  alert?: string
  strategy?: string
  bridgeScript?: string
  alignScore?: number
  driftFromBaseline?: number
  footerHint?: string
  tickIndex?: number
  elapsedMs?: number
  timeboxMs?: number
  ts?: number
  segmentId?: string
}

function headerFor(card: CardModel): string {
  const glyph = card.kind === 'drift' ? '◆' : card.kind === 'actions' ? '■' : '●'
  const timer = typeof card.elapsedMs === 'number'
    ? ` ${formatDuration(card.elapsedMs)}${typeof card.timeboxMs === 'number' ? ` / ${formatDuration(card.timeboxMs)}` : ''}`
    : ''
  const align = typeof card.alignScore === 'number'
    ? ` align ${card.alignScore.toFixed(2)} ${typeof card.driftFromBaseline === 'number' && card.driftFromBaseline > 0.05 ? '▼' : '▲'}`
    : ''
  const drift = typeof card.driftFromBaseline === 'number' && card.driftFromBaseline > 0
    ? ` drift ${card.driftFromBaseline.toFixed(2)}`
    : ''
  const tick = card.tickIndex ? ` tick ${card.tickIndex}` : ''
  return truncate(`${glyph}${timer}${tick}${align}${drift} ${card.title}`, 120)
}

function bodyFor(card: CardModel): string {
  if (card.kind === 'drift') {
    const alert = truncate(card.alert ?? card.bullets[0] ?? 'Conversation moved off the close goal.', 54)
    const strategy = truncate(card.strategy ?? 'Off-topic talk burns time and deal momentum.', 54)
    const bridge = truncate(card.bridgeScript ?? card.steer ?? 'Shall we return to the goal now?', 72)
    const bar = progressBar(card.alignScore ?? 0)
    const pct = card.alignScore != null ? ` ${Math.round(card.alignScore * 100)}%` : ''
    return [
      `[DIVERSION]: ${alert}`,
      `[STRATEGY]: ${strategy}`,
      `[BRIDGE]: ${bridge}`,
      '',
      `${bar}${pct}`,
    ].join('\n')
  }
  if (card.kind === 'actions') {
    return formatBullets(card.bullets, CARD_MAX_BULLETS)
  }
  return formatBullets(card.bullets, CARD_MAX_BULLETS)
}

export function buildCardPage(card: CardModel): CreateStartUpPageContainer {
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
