import { newScreenId, type Widget } from '../model'
import type { WidgetDefinition } from './types'

const definitions = new Map<string, WidgetDefinition>()

export function registerWidgets(list: WidgetDefinition[]): void {
  for (const definition of list) definitions.set(definition.type, definition)
}

export function widgetDefinition(type: string): WidgetDefinition | undefined {
  return definitions.get(type)
}

export function allWidgets(): WidgetDefinition[] {
  return [...definitions.values()]
}

/** A new widget of a type, centred on a point of the page. */
export function createWidget(type: string, center: { x: number; y: number }, pageWidth = 1920): Widget {
  const definition = definitions.get(type)
  if (!definition) throw new Error(`未知组件：${type}`)
  // Default sizes are for 1920-wide pages; larger pages get proportionally larger widgets.
  const scale = Math.max(0.5, pageWidth / 1920)
  const w = Math.round(definition.size[0] * scale)
  const h = Math.round(definition.size[1] * scale)
  return {
    id: newScreenId('widget'),
    type,
    name: definition.name,
    x: Math.round(center.x - w / 2),
    y: Math.round(center.y - h / 2),
    w,
    h,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    props: JSON.parse(JSON.stringify(definition.props)),
    ...(definition.data ? { data: JSON.parse(JSON.stringify(definition.data.default)) } : {}),
  }
}

/** All props with defaults filled in from the definition (documents saved before a prop existed). */
export function propsOf<T extends object>(widget: Widget): T {
  return { ...(definitions.get(widget.type)?.props ?? {}), ...widget.props } as T
}

/** A prop with its default from the definition (documents saved before a prop existed). */
export function prop<T>(widget: Widget, key: string): T {
  const value = widget.props[key]
  return (value === undefined ? definitions.get(widget.type)?.props[key] : value) as T
}
