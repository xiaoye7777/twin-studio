declare module '@meteor3d/core' {
  import type { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

  interface MeteorOrbitControls {
    enabled: boolean
  }

  export class SceneManager {
    constructor(canvas: HTMLCanvasElement)

    canvas: HTMLCanvasElement | null
    disposed: boolean
    scene: Scene
    camera: PerspectiveCamera
    renderer: WebGLRenderer
    controls: MeteorOrbitControls
    gridHelper: Object3D | null
    gridVisible: boolean

    addObject<T extends Object3D>(object: T): boolean
    findObjectByBid<T extends Object3D = Object3D>(bid: string): T | null
    setGridHelper(
      visible: boolean,
      length?: number,
      width?: number,
      widthSegments?: number,
      lengthSegments?: number,
    ): void
    dispose(): void
  }
}
