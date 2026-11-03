import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { angleBetween, slerp, toGeoPoint, toVector, type GeoPoint, type Vec3 } from './geo'

const dayUrl = new URL('../assets/earth-day.webp', import.meta.url).href
const nightUrl = new URL('../assets/earth-night.webp', import.meta.url).href
const cloudsUrl = new URL('../assets/earth-clouds.webp', import.meta.url).href

export const EARTH_FOV = 30

const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormalWorld);
    vec3 v = normalize(vViewDir);
    float light = dot(n, sunDirection);
    float daylight = smoothstep(-0.1, 0.3, light);
    vec3 albedo = texture2D(dayMap, vUv).rgb;
    // 蓝色明显多过红绿的地方当海面，给一点太阳高光
    float water = smoothstep(0.015, 0.06, albedo.b - max(albedo.r, albedo.g * 0.92));
    vec3 color = albedo * (0.025 + 1.35 * max(light, 0.0));
    vec3 halfway = normalize(sunDirection + v);
    color += water * pow(max(dot(n, halfway), 0.0), 70.0) * vec3(0.55, 0.6, 0.65) * daylight;
    color += texture2D(nightMap, vUv).rgb * (1.0 - daylight) * vec3(1.5, 1.25, 0.9);
    // 边缘的大气散射
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.2);
    color = mix(color, vec3(0.42, 0.68, 1.0), rim * (0.12 + 0.68 * daylight));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

const CLOUD_FRAGMENT = /* glsl */ `
  uniform sampler2D cloudMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormalWorld);
    float cover = texture2D(cloudMap, vUv).r;
    float light = dot(n, sunDirection);
    float brightness = 0.03 + 0.86 * smoothstep(-0.12, 0.65, light);
    // 边缘拉得很宽，云才有由厚到薄的过渡，不像贴上去的白斑
    gl_FragColor = vec4(vec3(brightness), smoothstep(0.02, 0.95, cover) * 0.82);
    #include <colorspace_fragment>
  }
`

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 sunDirection;
  uniform float strength;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormalWorld);
    vec3 v = normalize(vViewDir);
    float facing = max(dot(n, -v), 0.0);
    float glow = pow(facing, 5.0) * 2.2;
    float lit = 0.25 + 0.75 * smoothstep(-0.5, 0.5, dot(n, sunDirection));
    gl_FragColor = vec4(vec3(0.3, 0.58, 1.0) * glow * lit * strength, 1.0);
    #include <colorspace_fragment>
  }
`

const VEIL_FRAGMENT = /* glsl */ `
  uniform float density;
  uniform float time;
  uniform vec2 resolution;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float total = 0.0;
    float weight = 0.5;
    for (int i = 0; i < 5; i++) {
      total += noise(p) * weight;
      p = p * 2.03 + 11.7;
      weight *= 0.5;
    }
    return total;
  }
  void main() {
    vec2 uv = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
    // 四层云不断朝镜头放大，轮流淡入淡出，就是在云里穿行的感觉
    float cloud = 0.0;
    float total = 0.0;
    float shade = 0.0;
    for (int i = 0; i < 4; i++) {
      float cycle = fract(time * 0.5 + float(i) / 4.0);
      float weight = sin(cycle * 3.14159);
      float scale = 2.6 * pow(0.16, cycle);
      vec2 p = uv * scale + float(i) * 17.3;
      float n = fbm(p);
      cloud += n * weight;
      // 朝左上方再采一次：差值就是云团的受光面，云才有体积
      shade += (n - fbm(p + vec2(-0.09, 0.11))) * weight;
      total += weight;
    }
    cloud /= total;
    shade /= total;
    float threshold = mix(0.95, -0.6, density);
    float alpha = smoothstep(threshold, threshold + 0.2, cloud + length(uv) * 0.14);
    float lit = clamp(0.62 + smoothstep(0.28, 0.72, cloud) * 0.22 + shade * 4.0, 0.0, 1.0);
    vec3 color = mix(vec3(0.42, 0.5, 0.62), vec3(1.0, 0.99, 0.97), lit);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`

function ringTexture(color: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = 5
  context.shadowColor = color
  context.shadowBlur = 14
  context.beginPath()
  context.arc(64, 64, 40, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(64, 64, 11, 0, Math.PI * 2)
  context.fill()
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

const SPACE_COLOR = new Color(0x02040a)
const ARC_SEGMENTS = 128
const MARKER_RADIUS = 1.012
const SUN_ANGLE_OFFSET = new Vector3(-0.55, 0.42, 0.72).normalize()

/**
 * 地球：独立的渲染器和画布，叠在项目画布上方，和项目的场景、管线没有共用任何东西。
 * 太阳跟着相机走（偏一个角度），目的地永远是白天、明暗交界线落在边缘上，和真实时刻无关。
 */
export class EarthScene {
  readonly camera = new PerspectiveCamera(EARTH_FOV, 1, 0.001, 200)
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly veilScene = new Scene()
  private readonly veilCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly earth = new Group()
  private readonly clouds: Mesh
  private readonly stars: Points
  private readonly sun = { value: new Vector3(1, 0, 0) }
  private readonly glowStrength = { value: 1 }
  private readonly maps = {
    day: { value: null as Texture | null },
    night: { value: null as Texture | null },
    clouds: { value: null as Texture | null },
  }
  private readonly veil = {
    density: { value: 0 },
    time: { value: 0 },
    resolution: { value: new Vector2(1, 1) },
  }
  private readonly arc: Line
  private readonly fromMarker: Sprite
  private readonly toMarker: Sprite
  private readonly raycaster = new Raycaster()
  private readonly disposables: { dispose(): void }[] = []
  private earthVisible = true

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.autoClear = false

    const shape = new SphereGeometry(1, 128, 96)
    const surface = new ShaderMaterial({
      uniforms: { dayMap: this.maps.day, nightMap: this.maps.night, sunDirection: this.sun },
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
    })
    const cloudMaterial = new ShaderMaterial({
      uniforms: { cloudMap: this.maps.clouds, sunDirection: this.sun },
      vertexShader: EARTH_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      transparent: true,
      depthWrite: false,
    })
    const glowMaterial = new ShaderMaterial({
      uniforms: { sunDirection: this.sun, strength: this.glowStrength },
      vertexShader: EARTH_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    this.clouds = new Mesh(shape, cloudMaterial)
    this.clouds.scale.setScalar(1.008)
    const glow = new Mesh(shape, glowMaterial)
    glow.scale.setScalar(1.16)
    this.earth.add(new Mesh(shape, surface), this.clouds, glow)

    this.stars = this.createStars()
    const arcGeometry = new BufferGeometry()
    arcGeometry.setAttribute('position', new BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 3), 3))
    const arcMaterial = new LineBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    this.arc = new Line(arcGeometry, arcMaterial)
    this.arc.frustumCulled = false
    const fromTexture = ringTexture('#e2f2f4')
    const toTexture = ringTexture('#5eead4')
    const fromMaterial = new SpriteMaterial({ map: fromTexture, transparent: true, depthWrite: false })
    const toMaterial = new SpriteMaterial({ map: toTexture, transparent: true, depthWrite: false })
    this.fromMarker = new Sprite(fromMaterial)
    this.toMarker = new Sprite(toMaterial)
    this.fromMarker.visible = this.toMarker.visible = this.arc.visible = false
    this.scene.add(this.stars, this.earth, this.arc, this.fromMarker, this.toMarker)

    const veilMaterial = new ShaderMaterial({
      uniforms: this.veil,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: VEIL_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const veilShape = new PlaneGeometry(2, 2)
    this.veilScene.add(new Mesh(veilShape, veilMaterial))
    this.disposables.push(
      this.renderer,
      shape,
      surface,
      cloudMaterial,
      glowMaterial,
      arcGeometry,
      arcMaterial,
      fromTexture,
      toTexture,
      fromMaterial,
      toMaterial,
      veilMaterial,
      veilShape,
    )
    this.resize()
  }

  /** 贴图全部上传到显卡后才完成，避免飞行中第一次用到时掉帧。 */
  async load(): Promise<void> {
    const loader = new TextureLoader()
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const prepare = async (url: string, srgb: boolean) => {
      const texture = await loader.loadAsync(url)
      if (srgb) texture.colorSpace = SRGBColorSpace
      texture.anisotropy = anisotropy
      this.renderer.initTexture(texture)
      this.disposables.push(texture)
      return texture
    }
    const [day, night, clouds] = await Promise.all([
      prepare(dayUrl, true),
      prepare(nightUrl, true),
      prepare(cloudsUrl, false),
    ])
    this.maps.day.value = day
    this.maps.night.value = night
    this.maps.clouds.value = clouds
    this.renderer.compile(this.scene, this.camera)
    this.renderer.compile(this.veilScene, this.veilCamera)
  }

  resize(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.veil.resolution.value.set(width, height)
  }

  /** 相机在 center 正上方 altitude 处。低空时向北微微前倾，看到地平线方向才有飞行感。 */
  setView(center: Vec3, altitude: number): void {
    const distance = 1 + altitude
    this.camera.position.set(center[0], center[1], center[2]).multiplyScalar(distance)
    const up = new Vector3(0, 1, 0)
    const look = new Vector3(center[0], center[1], center[2])
    const north = up.clone().addScaledVector(look, -up.dot(look))
    if (north.lengthSq() < 1e-4) north.set(1, 0, 0)
    north.normalize()
    const tilt = Math.max(0, 1 - altitude / 0.6) * altitude * 0.9
    const target = look.clone().addScaledVector(north, tilt)
    this.camera.up.copy(north)
    this.camera.lookAt(target)
    this.camera.updateMatrixWorld()
    // 太阳方向：相机坐标系里固定的偏移转到世界坐标
    this.sun.value.copy(SUN_ANGLE_OFFSET).transformDirection(this.camera.matrixWorld)
    this.glowStrength.value = Math.min(1, altitude / 0.5)
    const size = 0.055 * Math.min(altitude, 1.2) + 0.002
    this.fromMarker.scale.setScalar(size)
    this.toMarker.scale.setScalar(size)
  }

  setEarthVisible(visible: boolean): void {
    this.earthVisible = visible
  }

  setVeil(density: number): void {
    this.veil.density.value = density
  }

  /** 起点、终点标记和两点之间的航线，航线弧高随距离增加。 */
  setRoute(from: GeoPoint | null, to: GeoPoint | null): void {
    this.placeMarker(this.fromMarker, from)
    this.placeMarker(this.toMarker, to)
    this.arc.visible = !!from && !!to
    if (!from || !to) return
    const a = toVector(from)
    const b = toVector(to)
    const height = 0.02 + angleBetween(a, b) * 0.09
    const positions = this.arc.geometry.getAttribute('position') as BufferAttribute
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS
      const p = slerp(a, b, t)
      const radius = MARKER_RADIUS + Math.sin(t * Math.PI) * height
      positions.setXYZ(i, p[0] * radius, p[1] * radius, p[2] * radius)
    }
    positions.needsUpdate = true
  }

  setArcProgress(progress: number): void {
    this.arc.geometry.setDrawRange(0, Math.round(progress * ARC_SEGMENTS) + 1)
  }

  private placeMarker(marker: Sprite, point: GeoPoint | null): void {
    marker.visible = !!point
    if (!point) return
    const [x, y, z] = toVector(point)
    marker.position.set(x, y, z).multiplyScalar(MARKER_RADIUS)
  }

  render(delta: number): void {
    this.veil.time.value += delta
    this.clouds.rotation.y += delta * 0.006
    // 有地球时背后是不透明的太空；没有时完全透明，透出下面的真实场景
    this.renderer.setClearColor(SPACE_COLOR, this.earthVisible ? 1 : 0)
    this.renderer.clear()
    if (this.earthVisible) this.renderer.render(this.scene, this.camera)
    if (this.veil.density.value > 0.001) this.renderer.render(this.veilScene, this.veilCamera)
  }

  /** 把地球表面一点投到屏幕（CSS 像素）；转到背面时 visible 为 false。 */
  project(point: GeoPoint): { x: number; y: number; visible: boolean } {
    const [x, y, z] = toVector(point)
    const surface = new Vector3(x, y, z)
    const toCamera = this.camera.position.clone().sub(surface).normalize()
    const facing = surface.dot(toCamera)
    const screen = surface.clone().project(this.camera)
    return {
      x: ((screen.x + 1) / 2) * window.innerWidth,
      y: ((1 - screen.y) / 2) * window.innerHeight,
      visible: facing > 0.08,
    }
  }

  /** 屏幕坐标点到地球上的哪里，点到太空返回 null。 */
  pick(clientX: number, clientY: number): GeoPoint | null {
    const ndc = new Vector2((clientX / window.innerWidth) * 2 - 1, 1 - (clientY / window.innerHeight) * 2)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.ray.intersectSphere(new Sphere(new Vector3(), 1), new Vector3())
    return hit ? toGeoPoint([hit.x, hit.y, hit.z]) : null
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose()
    this.stars.geometry.dispose()
    ;(this.stars.material as PointsMaterial).dispose()
    this.renderer.forceContextLoss()
  }

  private createStars(): Points {
    const count = 4200
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const z = Math.random() * 2 - 1
      const angle = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - z * z) * 90
      positions.set([r * Math.cos(angle), z * 90, r * Math.sin(angle)], i * 3)
      // 大部分星星很暗，少数亮星才有层次
      const brightness = Math.pow(Math.random(), 3.5) * 0.9 + 0.1
      colors.set([brightness, brightness * 0.97, brightness * (0.9 + Math.random() * 0.1)], i * 3)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    const material = new PointsMaterial({
      size: 1.6,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    })
    return new Points(geometry, material)
  }
}
