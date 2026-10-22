/**
 * Data screens (数据大屏): a 2D page of widgets laid out on a fixed design canvas, scaled to whatever screen
 * plays it. Widgets read static data or live data from a linked 3D scene's devices, and can drive the 3D
 * scene (and be driven by it) through the Viewer SDK.
 */

export const SCREEN_DOCUMENT_VERSION = 1

/** How the design canvas maps onto the real screen. */
export type ScreenScaleMode = 'fit' | 'fill' | 'width' | 'height' | 'stretch'

export interface ScreenPage {
  width: number
  height: number
  background: {
    color: string
    /** Decoration drawn over the colour. */
    style: 'plain' | 'grid' | 'glow' | 'stars'
    /** Optional picture (data URL) covering the page. */
    image: string | null
  }
  scaleMode: ScreenScaleMode
}

/** What happens when a widget (or an item in it) is clicked. `$item` stands for the clicked item's name. */
export type ScreenAction =
  | { type: 'select-device'; deviceId: string }
  | { type: 'fly-to-view'; bookmarkId: string }
  | { type: 'reset-view' }
  | { type: 'play-tour'; tourId: string }
  | { type: 'stop-tour' }
  | { type: 'toggle-layer'; nodeId: string }
  | { type: 'open-url'; url: string }

export interface WidgetEvent {
  id: string
  trigger: 'click'
  action: ScreenAction
}

export type DataSourceKind = 'static' | 'device' | 'aggregate' | 'devices' | 'history' | 'alarms' | 'selected' | 'stat'

/** Where a widget's data comes from. Fields not used by the kind are ignored. */
export interface DataBinding {
  source: DataSourceKind
  /** static: JSON text — a value, an object or an array of rows. */
  json?: string
  /** device: one device's variable. */
  deviceId?: string
  variable?: string
  /** devices / aggregate / history: which devices (empty = all of `deviceType`, or all). */
  deviceIds?: string[]
  deviceType?: string
  /** devices / history: columns; aggregate: the variable is `variable`. */
  variables?: string[]
  aggregate?: 'sum' | 'avg' | 'max' | 'min' | 'count'
  /** history: seconds of samples to keep visible. */
  window?: number
  /** stat: scene-level figure. */
  stat?: 'devices' | 'online' | 'alarms'
}

export interface Widget {
  id: string
  type: string
  name: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  locked: boolean
  hidden: boolean
  props: Record<string, unknown>
  data?: DataBinding
  events?: WidgetEvent[]
}

export interface ScreenDocument {
  version: typeof SCREEN_DOCUMENT_VERSION
  id: string
  name: string
  createdAt: string
  updatedAt: string
  page: ScreenPage
  /** The 3D project whose devices feed the data and which 3D widgets show. */
  sceneProjectId: string | null
  /** Back to front. */
  widgets: Widget[]
  /** A JPEG of the page for the screen list, refreshed by the editor (not part of the edit history). */
  cover?: string
}

export const pagePresets = [
  { id: '1920x1080', label: '1920 × 1080（16:9 标准）', width: 1920, height: 1080 },
  { id: '3840x2160', label: '3840 × 2160（4K）', width: 3840, height: 2160 },
  { id: '2560x1080', label: '2560 × 1080（21:9 宽屏）', width: 2560, height: 1080 },
  { id: '3840x1080', label: '3840 × 1080（32:9 拼接屏）', width: 3840, height: 1080 },
  { id: '1024x768', label: '1024 × 768（4:3 投影）', width: 1024, height: 768 },
  { id: '1080x1920', label: '1080 × 1920（竖屏）', width: 1080, height: 1920 },
] as const

export function newScreenId(prefix = 'screen'): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`
}

export function createScreenDocument(name: string, width = 1920, height = 1080): ScreenDocument {
  const now = new Date().toISOString()
  return {
    version: SCREEN_DOCUMENT_VERSION,
    id: newScreenId(),
    name,
    createdAt: now,
    updatedAt: now,
    page: { width, height, background: { color: '#060b16', style: 'grid', image: null }, scaleMode: 'fit' },
    sceneProjectId: null,
    widgets: [],
  }
}

/** Light structural check for documents read from storage or imported files. */
export function isScreenDocument(value: unknown): value is ScreenDocument {
  if (!value || typeof value !== 'object') return false
  const doc = value as Partial<ScreenDocument>
  return (
    doc.version === SCREEN_DOCUMENT_VERSION &&
    typeof doc.id === 'string' &&
    typeof doc.name === 'string' &&
    !!doc.page &&
    typeof doc.page.width === 'number' &&
    typeof doc.page.height === 'number' &&
    Array.isArray(doc.widgets)
  )
}
