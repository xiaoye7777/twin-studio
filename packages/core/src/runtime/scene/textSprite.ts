import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial } from 'three'

export type TextSpriteStyle = 'tag' | 'title' | 'pin' | 'panel'

export interface TextSpriteContent {
  /** First line is the title; later lines are rows (a "label: value" row is split on the first "\t"). */
  lines: string[]
  style: TextSpriteStyle
  color: string
  background: string
  /** Size multiplier; 1 is roughly 4% of the viewport height per line. */
  size: number
  opacity?: number
}

const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif'
const SCALE = 2

function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + w, y, x + w, y + h, r)
  context.arcTo(x + w, y + h, x, y + h, r)
  context.arcTo(x, y + h, x, y, r)
  context.arcTo(x, y, x + w, y, r)
  context.closePath()
}

/**
 * A camera-facing label drawn on a canvas. Its on-screen size is a fixed fraction of the viewport height,
 * so text stays legible on a laptop and on a cinema wall alike.
 */
export class TextSprite extends Sprite {
  private readonly canvas = document.createElement('canvas')
  private readonly texture: CanvasTexture
  private signature = ''
  private aspect = 1

  constructor(content?: TextSpriteContent) {
    const texture = new CanvasTexture(document.createElement('canvas'))
    super(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, sizeAttenuation: false }))
    this.texture = texture
    this.texture.image = this.canvas
    this.texture.colorSpace = SRGBColorSpace
    this.texture.minFilter = LinearFilter
    this.texture.generateMipmaps = false
    this.renderOrder = 10
    this.userData.editorInternal = true
    this.raycast = () => {}
    if (content) this.setContent(content)
  }

  /** Redraws only when the content changed. */
  setContent(content: TextSpriteContent): void {
    const signature = JSON.stringify(content)
    if (signature === this.signature) return
    this.signature = signature
    const context = this.canvas.getContext('2d')
    if (!context) return
    const { lines, style, color, background } = content
    const title = lines[0] ?? ''
    const rows = lines.slice(1)
    const titleSize = (style === 'title' ? 40 : 28) * SCALE
    const rowSize = 24 * SCALE
    const pad = (style === 'title' ? 18 : 14) * SCALE
    context.font = `600 ${titleSize}px ${FONT}`
    let width = context.measureText(title).width
    context.font = `500 ${rowSize}px ${FONT}`
    for (const row of rows) {
      const [label, value = ''] = row.split('\t')
      width = Math.max(width, context.measureText(`${label}${value}`).width + 36 * SCALE)
    }
    const pin = style === 'pin' ? 22 * SCALE : 0
    const rowGap = 10 * SCALE
    const contentHeight = titleSize + rows.length * (rowSize + rowGap)
    const w = Math.ceil(width + pad * 2 + (style === 'tag' || style === 'panel' ? 8 * SCALE : 0))
    const h = Math.ceil(contentHeight + pad * 2 + pin)
    this.canvas.width = w
    this.canvas.height = h
    context.clearRect(0, 0, w, h)
    const boxHeight = h - pin
    if (style !== 'title') {
      roundRect(context, 1, 1, w - 2, boxHeight - 2, 10 * SCALE)
      context.fillStyle = rgba(background, 0.82)
      context.fill()
      context.lineWidth = 2 * SCALE
      context.strokeStyle = rgba(color, 0.9)
      context.stroke()
      if (style === 'tag' || style === 'panel') {
        context.fillStyle = color
        context.fillRect(1, 10 * SCALE, 6 * SCALE, boxHeight - 20 * SCALE)
      }
      if (pin) {
        context.beginPath()
        context.moveTo(w / 2 - pin * 0.7, boxHeight - 2)
        context.lineTo(w / 2, h)
        context.lineTo(w / 2 + pin * 0.7, boxHeight - 2)
        context.closePath()
        context.fillStyle = color
        context.fill()
      }
    }
    context.textBaseline = 'top'
    context.font = `600 ${titleSize}px ${FONT}`
    context.fillStyle = style === 'title' ? color : '#ffffff'
    if (style === 'title') {
      context.shadowColor = 'rgba(0,0,0,0.65)'
      context.shadowBlur = 8 * SCALE
    }
    context.textAlign = rows.length ? 'left' : 'center'
    context.fillText(title, rows.length ? pad + 6 * SCALE : w / 2, pad)
    context.shadowBlur = 0
    let y = pad + titleSize + rowGap
    context.font = `500 ${rowSize}px ${FONT}`
    for (const row of rows) {
      const [label, value] = row.split('\t')
      context.textAlign = 'left'
      context.fillStyle = 'rgba(220,226,234,0.75)'
      context.fillText(label ?? '', pad + 6 * SCALE, y)
      if (value !== undefined) {
        context.textAlign = 'right'
        context.fillStyle = color
        context.fillText(value, w - pad, y)
      }
      y += rowSize + rowGap
    }
    this.texture.needsUpdate = true
    this.aspect = w / h
    const lineHeight = 0.045 * content.size
    const height = (h / (titleSize + pad * 2)) * lineHeight
    this.scale.set(height * this.aspect, height, 1)
    this.center.set(0.5, 0)
    this.material.opacity = content.opacity ?? 1
  }

  dispose(): void {
    this.texture.dispose()
    this.material.dispose()
  }
}
