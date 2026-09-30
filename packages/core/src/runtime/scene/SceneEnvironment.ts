import { AmbientLight, DirectionalLight, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import type { SceneCameraViewV1, SceneSettingsV1 } from '../../domain/scene'
import type { AssetRepository } from '../../infrastructure/assets/AssetRepository'
import type { MeteorScene } from '../../infrastructure/meteor3d'
import type { ImportedAssetResourceRegistry } from './ImportedAssetResourceRegistry'

/** The parts of the engine a scene document is rendered through. MeteorScene satisfies it; tests fake it. */
export type SceneHost = Pick<
  MeteorScene,
  | 'addObject'
  | 'removeObject'
  | 'loadGLTFModel'
  | 'getScene'
  | 'getCamera'
  | 'setGridHelper'
  | 'setAxesHelper'
  | 'loadEnvironment'
  | 'clearEnvironment'
  | 'setView'
>

/** Scene settings (lights, ground, helpers, environment map) and the camera view. */
export class SceneEnvironment {
  private disposed = false
  private ambient: AmbientLight | null = null
  private directional: DirectionalLight | null = null
  private ground: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null
  private environmentId: string | null | undefined
  private environmentQueue: Promise<void> = Promise.resolve()
  status = 'None'

  constructor(
    private readonly host: SceneHost,
    private readonly assets: AssetRepository,
    private readonly resources: ImportedAssetResourceRegistry,
  ) {}

  private assertActive(): void {
    if (this.disposed) throw new DOMException('Scene loading cancelled', 'AbortError')
  }

  /** Applies settings synchronously; the returned promise settles once the environment map is loaded. */
  apply(settings: SceneSettingsV1): Promise<void> {
    this.assertActive()
    const scene = this.host.getScene()
    if (!this.ambient) {
      this.ambient = new AmbientLight(0xffffff)
      this.ambient.name = 'Editor Ambient Light'
      this.directional = new DirectionalLight(0xffffff)
      this.directional.name = 'Editor Directional Light'
      const geometry = new PlaneGeometry(1, 1)
      geometry.rotateX(-Math.PI / 2)
      this.ground = new Mesh(geometry, new MeshStandardMaterial({ roughness: 0.92, metalness: 0 }))
      this.ground.name = 'Editor Ground'
      this.ground.position.y = -0.01
      this.ground.receiveShadow = true
      for (const object of [this.ambient, this.directional, this.ground]) {
        object.userData.editorInfrastructure = true
        scene.add(object)
      }
    }
    const size = Math.max(1, settings.ground.size)
    const segments = Math.max(1, Math.min(200, Math.round(size / 10)))
    this.host.setGridHelper(settings.gridEnabled, size, size, segments, segments)
    this.host.setAxesHelper(settings.axesEnabled, Math.max(5, Math.min(50, size / 10)))
    this.ambient.intensity = settings.lighting.ambientIntensity
    this.directional!.intensity = settings.lighting.directionalIntensity
    this.directional!.position.fromArray(settings.lighting.directionalPosition)
    this.ground!.visible = settings.ground.enabled
    this.ground!.scale.set(settings.ground.size, 1, settings.ground.size)
    this.ground!.material.color.set(settings.ground.color)
    this.ground!.updateMatrixWorld(true)
    const id = settings.environmentAssetId
    const task = this.environmentQueue
      .then(async () => {
        this.assertActive()
        if (this.environmentId === id) return
        if (!id) {
          this.host.clearEnvironment()
          this.environmentId = null
          this.status = 'None'
          return
        }
        const asset = await this.assets.get(id)
        this.assertActive()
        if (!asset || asset.assetType !== 'environment') throw new Error('保存的环境资产不存在或类型不正确')
        const texture = await this.host.loadEnvironment(this.resources.getOrCreate(asset).objectUrl)
        this.assertActive()
        if (!texture) throw new Error('环境贴图加载失败')
        this.environmentId = id
        this.status = asset.name
      })
      .catch((error: unknown) => {
        if (!this.disposed) {
          this.host.clearEnvironment()
          this.environmentId = undefined
          this.status = 'Fallback'
        }
        throw error
      })
    this.environmentQueue = task.catch(() => {})
    return task
  }

  async restoreCamera(view: SceneCameraViewV1): Promise<void> {
    this.assertActive()
    const camera = this.host.getCamera()
    if (view.fov !== undefined) {
      camera.fov = view.fov
      camera.updateProjectionMatrix()
    }
    await this.host.setView({
      position: { x: view.position[0], y: view.position[1], z: view.position[2] },
      target: { x: view.target[0], y: view.target[1], z: view.target[2] },
      duration: 0,
    })
  }

  dispose(): void {
    // Lights, ground and the environment map belong to the host scene; its dispose frees them.
    this.disposed = true
  }
}
