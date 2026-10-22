import { type InjectionKey, shallowRef } from 'vue'
import type { ScreenDocument, Widget } from '../model'
import type { WidgetClick, WidgetData } from '../widgets/types'
import { staticData } from './staticData'

/**
 * What a rendered screen runs on: resolves each widget's data and carries out click actions. One per
 * editor or preview page.
 */
export class ScreenRuntime {
  readonly document = shallowRef<ScreenDocument | null>(null)

  constructor(readonly editing: boolean) {}

  setDocument(document: ScreenDocument): void {
    this.document.value = document
  }

  dataFor(widget: Widget): WidgetData | null {
    const binding = widget.data
    if (!binding) return null
    return staticData(binding.json)
  }

  /** A widget was clicked (in preview / on the big screen). */
  trigger(_widget: Widget, _click: WidgetClick): void {}

  dispose(): void {}
}

export const ScreenRuntimeKey: InjectionKey<ScreenRuntime> = Symbol('ScreenRuntime')
