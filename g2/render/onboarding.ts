import { RebuildPageContainer, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { textContainer } from './containers'
import { formatDuration, truncate } from './format'

export type OnboardingModel = {
  goal: string
  participants: string[]
  timeboxMs: number
  prospect?: string
  offer?: string
  nextAsk?: string
}

export function buildOnboardingPage(model: OnboardingModel): RebuildPageContainer {
  const participants = model.participants.length ? model.participants.join(' · ') : 'no names set'
  const body = [
    `prospect: ${truncate(model.prospect ?? 'prospect', 54)}`,
    `offer: ${truncate(model.offer ?? 'offer', 58)}`,
    `goal: ${truncate(model.goal, 116)}`,
    `ask: ${truncate(model.nextAsk ?? 'confirm next step', 68)}`,
    `people: ${truncate(participants, 78)}`,
  ].join('\n')

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [
      textContainer({
        id: 1,
        name: 'onbd-head',
        x: 0,
        y: 0,
        w: 576,
        h: 36,
        content: `● Confirm sales goal · ${formatDuration(model.timeboxMs)}`,
        padding: 4,
      }),
      textContainer({
        id: 2,
        name: 'onbd-body',
        x: 0,
        y: 40,
        w: 576,
        h: 208,
        content: body,
        capture: true,
        padding: 6,
      }),
      textContainer({
        id: 3,
        name: 'onbd-foot',
        x: 0,
        y: 252,
        w: 576,
        h: 36,
        content: '● start listening  ·  double tap back',
        padding: 4,
      }),
    ],
    listObject: [],
    imageObject: [],
  })
}

export async function renderOnboarding(
  bridge: EvenAppBridge,
  model: OnboardingModel,
): Promise<void> {
  await bridge.rebuildPageContainer(buildOnboardingPage(model))
}
