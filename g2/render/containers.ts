import { TextContainerProperty } from '@evenrealities/even_hub_sdk'

export const DISPLAY_W = 576
export const DISPLAY_H = 288

export function textContainer(opts: {
  id: number
  name: string
  x: number
  y: number
  w: number
  h: number
  content: string
  capture?: boolean
  border?: number
  padding?: number
}): TextContainerProperty {
  return new TextContainerProperty({
    containerID: opts.id,
    containerName: opts.name,
    xPosition: opts.x,
    yPosition: opts.y,
    width: opts.w,
    height: opts.h,
    content: opts.content.slice(0, 1000),
    isEventCapture: opts.capture ? 1 : 0,
    borderWidth: opts.border ?? 0,
    borderColor: opts.border ? 12 : 0,
    borderRadius: 0,
    paddingLength: opts.padding ?? 4,
  })
}
