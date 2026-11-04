import { toCanvas } from 'html-to-image'
import type { TwinSceneViewerPublicApi } from '@twin-studio/core'
import type { ScreenDocument } from '../model'

interface ChartHandle {
  setOption(option: object): void
  getZr(): { refreshImmediately(): void }
}

/**
 * A JPEG thumbnail of a rendered screen page. The DOM (text, charts' canvases, pictures) is rasterised by
 * html-to-image; 3D views are WebGL, which cannot be read back that way, so each paints its own snapshot
 * into its widget's place.
 */
export async function captureScreen(
  page: HTMLElement,
  screen: ScreenDocument,
  viewers: ReadonlyMap<string, TwinSceneViewerPublicApi>,
  charts: Iterable<ChartHandle> = [],
  width = 640,
): Promise<string | null> {
  const scale = width / screen.page.width
  // Draw everything at rest: charts and transitions may be mid-animation (or paused in a background tab).
  page.classList.add('is-capturing')
  for (const chart of charts) {
    chart.setOption({ animation: false })
    chart.getZr().refreshImmediately()
  }
  try {
    return await draw(page, screen, viewers, scale)
  } finally {
    page.classList.remove('is-capturing')
    for (const chart of charts) chart.setOption({ animation: true })
  }
}

async function draw(
  page: HTMLElement,
  screen: ScreenDocument,
  viewers: ReadonlyMap<string, TwinSceneViewerPublicApi>,
  scale: number,
): Promise<string | null> {
  const canvas = await toCanvas(page, {
    pixelRatio: scale,
    skipFonts: true,
    cacheBust: false,
    backgroundColor: screen.page.background.color,
    // 3D views are drawn separately; web pages from other sites cannot be captured.
    filter: node =>
      !(node instanceof HTMLCanvasElement && node.closest('[data-widget-type="scene"]')) &&
      !(node instanceof HTMLIFrameElement) &&
      !(node instanceof HTMLElement && node.classList.contains('widget__api')),
  })
  const context = canvas.getContext('2d')
  if (!context) return null
  for (const widget of screen.widgets) {
    const viewer = viewers.get(widget.id)
    if (!viewer || widget.hidden) continue
    const blob = await viewer.screenshot().catch(() => null)
    if (!blob) continue
    const bitmap = await createImageBitmap(blob)
    context.save()
    context.globalAlpha = widget.opacity
    context.drawImage(bitmap, widget.x * scale, widget.y * scale, widget.w * scale, widget.h * scale)
    context.restore()
    bitmap.close()
  }
  return canvas.toDataURL('image/jpeg', 0.82)
}
