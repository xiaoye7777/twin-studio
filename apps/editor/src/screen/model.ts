import type { ApiBinding } from './datasources/model'

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
  /** `$item` sets the clicked item's name. */
  | { type: 'set-variable'; variable: string; value: string }

export interface WidgetEvent {
  id: string
  trigger: 'click'
  action: ScreenAction
}

export type DataSourceKind =
  'static' | 'api' | 'device' | 'aggregate' | 'devices' | 'history' | 'alarms' | 'selected' | 'stat'

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
  /** api: a dataset from the data interfaces (数据接口). */
  api?: ApiBinding
}

/**
 * A value shared across the screen: filters set it, clicks set it, and interface parameters read it, so
 * one choice re-queries every widget that depends on it.
 */
export interface ScreenVariable {
  /** Shown to users and used to refer to it, e.g. 园区. */
  name: string
  /** The value when the screen opens. */
  value: string
  description?: string
}

/** Variables every screen has; their values follow what happens on the screen. */
export const builtinVariables = [
  { name: '@selectedDeviceId', label: '选中设备编号', description: '在三维视图或其他组件中选中的设备' },
  { name: '@selectedDeviceName', label: '选中设备名称', description: '在三维视图或其他组件中选中的设备' },
  { name: '@today', label: '今天', description: '当天日期，如 2026-10-23' },
  { name: '@month', label: '本月', description: '当前月份，如 2026-10' },
] as const

export function variableLabel(name: string): string {
  return builtinVariables.find(item => item.name === name)?.label ?? name
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
  /** Widgets of one group are selected, moved and arranged together. */
  groupId?: string
  /** Played when the screen opens (preview and big screen). */
  enter?: WidgetEnter
}

export interface WidgetEnter {
  effect: 'fade' | 'up' | 'down' | 'left' | 'right' | 'zoom'
  /** Seconds after the screen opens. */
  delay: number
  /** Seconds. */
  duration: number
}

export interface ScreenGroup {
  id: string
  name: string
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
  /** Shared values for filters and linked widgets. */
  variables?: ScreenVariable[]
  groups?: ScreenGroup[]
  /** Ruler guides of the editor, in page pixels. */
  guides?: { x: number[]; y: number[] }
  /** A JPEG of the page for the screen list, refreshed by the editor (not part of the edit history). */
  cover?: string
  /** The version shown on the big screen (放映); edits after it stay a draft until published again. */
  published?: { versionId: string; at: string; signature: string }
}

/** A saved state of a screen: published, saved by hand, or kept automatically after an editing session. */
export interface ScreenVersion {
  id: string
  screenId: string
  kind: 'publish' | 'manual' | 'auto'
  label: string
  createdAt: string
  document: ScreenDocument
}

const signatures = new WeakMap<ScreenDocument, string>()

/** What a screen shows, without bookkeeping (covers, dates), to tell whether it changed. */
export function contentSignature(document: ScreenDocument): string {
  const known = signatures.get(document)
  if (known) return known
  const text = JSON.stringify([
    document.name,
    document.page,
    document.sceneProjectId,
    document.widgets,
    document.variables ?? [],
    document.groups ?? [],
  ])
  // FNV-1a: short and stable; collisions only risk a missed "modified" badge.
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const signature = `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`
  // Documents in the editor never change in place, so one signature per object is enough.
  signatures.set(document, signature)
  return signature
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
