import type { PerspectiveCamera } from 'three'

export interface HostView {
  position: [number, number, number]
  target: [number, number, number]
}

/**
 * 插件需要宿主提供的全部东西。这是结构类型：项目的 EditorSession 不用改就符合，插件也不用引用它。
 */
export interface GlobeHost {
  engine: {
    camera: PerspectiveCamera
    canvas: HTMLCanvasElement
    onFrame(listener: (delta: number, elapsed: number) => void): () => void
    setCameraControlsEnabled(enabled: boolean): void
    rig: {
      getView(): HostView
      flyTo(view: HostView, options: { duration: number }): unknown
    }
  }
  ui: { mode: string; ready: boolean; error?: string; saveState?: string }
  enterPreview(): void
  save?(): Promise<unknown>
}

export interface GlobeSite {
  id: string
  name: string
}
