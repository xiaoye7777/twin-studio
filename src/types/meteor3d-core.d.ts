declare module '@meteor3d/core' {
  import type {
    Intersection,
    Object3D,
    PerspectiveCamera,
    Scene,
    Vector2,
    WebGLRenderer,
  } from 'three'

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
    raycastObjects(
      screenPosition: Vector2,
      options?: { recursive?: boolean; includeTileMap?: boolean },
    ): Intersection<Object3D>[]
    setGridHelper(
      visible: boolean,
      length?: number,
      width?: number,
      widthSegments?: number,
      lengthSegments?: number,
    ): void
    focusObject(bid: string, options?: Record<string, unknown>): Promise<void>
    dispose(): void
  }

  export class PersistenceManager {
    constructor(
      sceneManager: SceneManager,
      editorStore?: unknown,
      dbManager?: unknown,
      options?: { dracoPath?: string },
    )

    disposed: boolean
    loadGLTFModel(
      url: string,
      options?: {
        assignBids?: boolean
        assetId?: string
        assetVersionId?: string
      },
    ): Promise<Object3D>
    dispose(): void
  }
}
