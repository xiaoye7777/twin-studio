import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CurvePath,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineCurve3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SpotLight,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import type {
  AreaNodeV2,
  LabelNodeV2,
  LightNodeV2,
  PathNodeV2,
  PrimitiveNodeV2,
  PrimitiveShape,
} from '../../domain/scene'
import { flowSpeed, patternTextures } from './surfacePatterns'
import { TextSprite } from './textSprite'

/** Seconds on a clock shared by every animated node and effect, so flows stay in phase. */
export const sceneTime = (): number => performance.now() / 1000

/** Frees geometries, materials and textures owned by a node object (never shared model resources). */
export function disposeOwned(object: Object3D): void {
  object.traverse(node => {
    if (node instanceof TextSprite) node.dispose()
    else if (node instanceof Mesh || node instanceof Line) {
      node.geometry.dispose()
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        disposePatternTextures(material as MeshStandardMaterial)
        material.dispose()
      }
    }
  })
}

// ---------------------------------------------------------------- primitives

export const primitiveDefaults: Record<PrimitiveShape, PrimitiveNodeV2['primitive']> = {
  box: { shape: 'box', color: '#8a97a8', width: 4, height: 3, depth: 4 },
  plane: { shape: 'plane', color: '#59626c', width: 20, height: 20 },
  cylinder: { shape: 'cylinder', color: '#7fa3b8', radiusTop: 1.5, radiusBottom: 1.5, height: 4, radialSegments: 32 },
  sphere: { shape: 'sphere', color: '#9fb4c7', radiusTop: 2 },
  cone: { shape: 'cone', color: '#c08a5b', radiusBottom: 2, height: 4, radialSegments: 32 },
}

export function primitiveGeometry(primitive: PrimitiveNodeV2['primitive']): BufferGeometry {
  const d = primitiveDefaults[primitive.shape]
  const height = primitive.height ?? d.height ?? 1
  const segments = Math.max(3, Math.min(128, Math.round(primitive.radialSegments ?? d.radialSegments ?? 32)))
  let geometry: BufferGeometry
  switch (primitive.shape) {
    case 'plane':
      geometry = new PlaneGeometry(primitive.width ?? d.width, primitive.height ?? d.height).rotateX(-Math.PI / 2)
      break
    case 'cylinder':
      geometry = new CylinderGeometry(
        primitive.radiusTop ?? d.radiusTop,
        primitive.radiusBottom ?? d.radiusBottom,
        height,
        segments,
      ).translate(0, height / 2, 0)
      break
    case 'sphere': {
      const radius = primitive.radiusTop ?? d.radiusTop ?? 1
      geometry = new SphereGeometry(radius, 48, 24).translate(0, radius, 0)
      break
    }
    case 'cone':
      geometry = new ConeGeometry(primitive.radiusBottom ?? d.radiusBottom, height, segments).translate(
        0,
        height / 2,
        0,
      )
      break
    default:
      geometry = new BoxGeometry(primitive.width ?? d.width, height, primitive.depth ?? d.depth).translate(
        0,
        height / 2,
        0,
      )
  }
  return geometry
}

function disposePatternTextures(material: MeshStandardMaterial): void {
  for (const texture of [material.map, material.emissiveMap]) if (texture?.userData.ownedPattern) texture.dispose()
}

/** How many pattern repeats fit across a primitive's main faces. */
function patternRepeat(primitive: PrimitiveNodeV2['primitive'], scale: number): [number, number] {
  const d = primitiveDefaults[primitive.shape]
  const width = primitive.width ?? d.width ?? 1
  const height = primitive.height ?? d.height ?? 1
  const radius = primitive.radiusBottom ?? primitive.radiusTop ?? d.radiusBottom ?? d.radiusTop ?? 1
  const across: Record<PrimitiveShape, [number, number]> = {
    plane: [width, height],
    box: [width, primitive.depth ?? d.depth ?? 1],
    cylinder: [Math.PI * 2 * radius, height],
    cone: [Math.PI * 2 * radius, height],
    sphere: [Math.PI * 2 * radius, Math.PI * radius],
  }
  const [u, v] = across[primitive.shape]
  return [Math.max(0.01, u / scale), Math.max(0.01, v / scale)]
}

/** Sets a material's pattern textures; returns whether a pattern is drawn. */
function applyPattern(
  material: MeshStandardMaterial,
  pattern: PrimitiveNodeV2['primitive']['pattern'],
  base: string,
  repeat: [number, number],
): boolean {
  const signature = pattern ? JSON.stringify([pattern, base, repeat]) : ''
  if (material.userData.patternSignature !== signature) {
    disposePatternTextures(material)
    const textures = pattern ? patternTextures(pattern, base, repeat) : null
    material.map = textures?.map ?? null
    material.emissiveMap = textures?.glow ?? null
    material.userData.patternSignature = signature
    material.userData.flow = textures ? flowSpeed(pattern?.kind) : 0
    material.needsUpdate = true
  }
  return material.map !== null
}

/** Scrolls flowing patterns (water) each frame. */
function flowPattern(material: MeshStandardMaterial): void {
  const speed = material.userData.flow as number | undefined
  if (speed && material.map) material.map.offset.set(sceneTime() * speed, sceneTime() * speed * 0.35)
}

export function applyPrimitiveMaterial(material: MeshStandardMaterial, primitive: PrimitiveNodeV2['primitive']): void {
  const pattern = primitive.pattern
  const patterned = applyPattern(
    material,
    pattern,
    primitive.color,
    pattern ? patternRepeat(primitive, pattern.scale) : [1, 1],
  )
  // A pattern's colours are drawn into its map.
  material.color.set(patterned ? '#ffffff' : primitive.color)
  const opacity = primitive.opacity ?? 1
  material.transparent = opacity < 1
  material.opacity = opacity
  material.depthWrite = opacity >= 0.98
  const glowing = patterned && material.emissiveMap !== null
  material.emissive.set(glowing ? pattern!.color : primitive.color)
  material.emissiveIntensity = glowing ? 0.6 + (primitive.emissive ?? 0) * 2.5 : (primitive.emissive ?? 0) * 2.5
  material.metalness = primitive.metalness ?? 0.1
  material.roughness = primitive.roughness ?? (pattern?.kind === 'water' ? 0.15 : 0.6)
  material.side = primitive.shape === 'plane' ? DoubleSide : material.side
  material.needsUpdate = true
}

export function createPrimitiveObject(node: PrimitiveNodeV2): Mesh {
  const material = new MeshStandardMaterial()
  applyPrimitiveMaterial(material, node.primitive)
  const mesh = new Mesh(primitiveGeometry(node.primitive), material)
  mesh.onBeforeRender = () => flowPattern(material)
  mesh.castShadow = node.primitive.shape !== 'plane'
  mesh.receiveShadow = true
  return mesh
}

// ---------------------------------------------------------------- paths

const flowShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    #include <fog_pars_vertex>
    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform float opacity; uniform float time; uniform float speed; uniform float repeat;
    uniform float ribbon;
    varying vec2 vUv;
    #include <fog_pars_fragment>
    void main() {
      float along = vUv.x * repeat - time * speed;
      float pulse = smoothstep(0.0, 0.55, fract(along)) * (1.0 - smoothstep(0.55, 0.62, fract(along)));
      float edge = ribbon > 0.5 ? 1.0 - smoothstep(0.35, 0.5, abs(vUv.y - 0.5)) : 1.0;
      vec3 base = color * 0.45;
      vec3 glow = color * (1.0 + pulse * 2.6);
      gl_FragColor = vec4(mix(base, glow, pulse), opacity * (0.55 + 0.45 * pulse) * edge);
      #include <fog_fragment>
    }`,
}

function polylineLength(points: readonly Vector3[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) length += points[i]!.distanceTo(points[i - 1]!)
  return length
}

/** A flat ribbon along a polyline on the ground, with uv.x running along its length. */
function ribbonGeometry(points: readonly Vector3[], width: number): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const total = Math.max(polylineLength(points), 1e-6)
  let travelled = 0
  for (let i = 0; i < points.length; i++) {
    const current = points[i]!
    const previous = points[i - 1] ?? current
    const next = points[i + 1] ?? current
    const direction = next.clone().sub(previous).setY(0)
    if (direction.lengthSq() < 1e-9) direction.set(1, 0, 0)
    direction.normalize()
    const side = new Vector3(-direction.z, 0, direction.x).multiplyScalar(width / 2)
    if (i > 0) travelled += current.distanceTo(previous)
    positions.push(
      current.x + side.x,
      current.y + 0.03,
      current.z + side.z,
      current.x - side.x,
      current.y + 0.03,
      current.z - side.z,
    )
    uvs.push(travelled / total, 0, travelled / total, 1)
    if (i > 0) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function createPathObject(node: PathNodeV2): Object3D {
  const { points: raw, closed, style, color, width, speed, opacity } = node.path
  const points = raw.map(point => new Vector3(...point))
  if (closed && points.length > 2) points.push(points[0]!.clone())
  const group = new Group()
  const length = polylineLength(points)
  if (style === 'tube' || style === 'flow') {
    const curve = new CurvePath<Vector3>()
    for (let i = 1; i < points.length; i++) curve.add(new LineCurve3(points[i - 1]!, points[i]!))
    const geometry = new TubeGeometry(
      curve,
      Math.max(8, Math.min(2000, (points.length - 1) * 24)),
      width / 2,
      10,
      false,
    )
    if (style === 'tube') {
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.35, transparent: opacity < 1, opacity }),
      )
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
      return group
    }
    const material = new ShaderMaterial({
      ...flowShader,
      uniforms: {
        color: { value: new Color(color) },
        opacity: { value: opacity },
        time: { value: 0 },
        speed: { value: speed * 0.5 },
        repeat: { value: Math.max(1, length / Math.max(width * 8, 2)) },
        ribbon: { value: 0 },
        fogColor: { value: new Color() },
        fogDensity: { value: 0 },
        fogNear: { value: 1 },
        fogFar: { value: 2000 },
      },
      transparent: true,
      depthWrite: false,
      fog: true,
    })
    const mesh = new Mesh(geometry, material)
    mesh.onBeforeRender = () => {
      material.uniforms.time!.value = sceneTime()
    }
    group.add(mesh)
    return group
  }
  const material = new ShaderMaterial({
    ...flowShader,
    uniforms: {
      color: { value: new Color(color) },
      opacity: { value: opacity },
      time: { value: 0 },
      speed: { value: speed * 0.5 },
      repeat: { value: Math.max(1, length / Math.max(width * 4, 1)) },
      ribbon: { value: 1 },
      fogColor: { value: new Color() },
      fogDensity: { value: 0 },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  })
  const mesh = new Mesh(ribbonGeometry(points, width), material)
  mesh.onBeforeRender = () => {
    material.uniforms.time!.value = sceneTime()
  }
  group.add(mesh)
  return group
}

// ---------------------------------------------------------------- areas

const wallShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform float opacity; uniform float time;
    varying vec2 vUv;
    void main() {
      float fade = pow(1.0 - vUv.y, 1.6);
      float scan = smoothstep(0.0, 0.08, 0.08 - abs(fract(time * 0.35) - vUv.y)) * 0.8;
      gl_FragColor = vec4(color * (1.2 + scan * 2.0), opacity * (fade * 0.85 + scan * 0.6));
    }`,
}

export function createAreaObject(node: AreaNodeV2): Object3D {
  const { points: raw, color, opacity, wallHeight, label, pattern } = node.area
  const points = raw.map(([x, , z]) => new Vector3(x, 0, z))
  const group = new Group()
  const shape = new Shape(points.map(p => new Vector2(p.x, -p.z)))
  const geometry = new ShapeGeometry(shape).rotateX(-Math.PI / 2)
  let fill: Mesh
  // A patterned area is a lit surface (lawn, paving, water); a plain one a translucent zone overlay.
  const surface = new MeshStandardMaterial({
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  if (pattern && applyPattern(surface, pattern, color, [1 / pattern.scale, 1 / pattern.scale])) {
    surface.transparent = opacity < 0.98
    surface.opacity = opacity
    surface.depthWrite = opacity >= 0.98
    surface.roughness = pattern.kind === 'water' ? 0.15 : 0.85
    if (surface.emissiveMap) {
      surface.emissive.set(pattern.color)
      surface.emissiveIntensity = 1.2
    }
    fill = new Mesh(geometry, surface)
    fill.onBeforeRender = () => flowPattern(surface)
  } else {
    surface.dispose()
    fill = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: opacity * 0.38,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    )
  }
  fill.position.y = 0.04
  fill.receiveShadow = true
  group.add(fill)
  const outline = new BufferGeometry().setFromPoints([...points, points[0]!].map(p => p.clone().setY(0.08)))
  group.add(new Line(outline, new LineBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity + 0.3) })))
  if (wallHeight > 0) {
    const positions: number[] = []
    const uvs: number[] = []
    const closed = [...points, points[0]!]
    for (let i = 1; i < closed.length; i++) {
      const a = closed[i - 1]!
      const b = closed[i]!
      positions.push(
        a.x,
        0,
        a.z,
        b.x,
        0,
        b.z,
        b.x,
        wallHeight,
        b.z,
        a.x,
        0,
        a.z,
        b.x,
        wallHeight,
        b.z,
        a.x,
        wallHeight,
        a.z,
      )
      uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    const material = new ShaderMaterial({
      ...wallShader,
      uniforms: { color: { value: new Color(color) }, opacity: { value: opacity }, time: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    })
    const wall = new Mesh(geometry, material)
    wall.onBeforeRender = () => {
      material.uniforms.time!.value = sceneTime()
    }
    group.add(wall)
  }
  if (label.trim()) {
    const center = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length)
    const sprite = new TextSprite({ lines: [label], style: 'title', color: '#ffffff', background: color, size: 1.1 }, 1)
    sprite.position.set(center.x, Math.max(1, wallHeight * 0.6), center.z)
    group.add(sprite)
  }
  return group
}

// ---------------------------------------------------------------- labels

export function createLabelObject(node: LabelNodeV2): Object3D {
  const group = new Group()
  // Labels the user placed outrank automatic ones.
  const sprite = new TextSprite(undefined, 3)
  group.add(sprite)
  updateLabelObject(group, node)
  return group
}

export function updateLabelObject(group: Object3D, node: LabelNodeV2): void {
  const sprite = group.children.find((child): child is TextSprite => child instanceof TextSprite)
  const { text, style, color, background, size, leader } = node.label
  sprite?.setContent({ lines: [text || ' '], style, color, background, size })
  let line = group.children.find((child): child is Line => child instanceof Line)
  if (leader && !line) {
    line = new Line(
      new BufferGeometry().setFromPoints([new Vector3(), new Vector3(0, -1, 0)]),
      new LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
    )
    line.raycast = () => {}
    const target = new Vector3()
    const leaderLine = line
    line.onBeforeRender = () => {
      // The leader runs from the label down to the ground, whatever the label's height.
      group.getWorldPosition(target)
      const scaleY = group.getWorldScale(new Vector3()).y || 1
      leaderLine.scale.y = Math.max(0.001, target.y / scaleY)
    }
    group.add(line)
  } else if (!leader && line) {
    line.removeFromParent()
    line.geometry.dispose()
    ;(line.material as LineBasicMaterial).dispose()
  }
  if (line && leader) (line.material as LineBasicMaterial).color.set(color)
}

// ---------------------------------------------------------------- lights

export function createLightObject(node: LightNodeV2): Object3D {
  const group = new Group()
  updateLightObject(group, node)
  return group
}

export function updateLightObject(group: Object3D, node: LightNodeV2): void {
  const { type, color, intensity, distance, angle, castShadow } = node.light
  let light = group.children.find(child => child instanceof PointLight || child instanceof SpotLight) as
    PointLight | SpotLight | undefined
  const wanted = type === 'spot' ? SpotLight : PointLight
  if (light && !(light instanceof wanted)) {
    light.removeFromParent()
    light.dispose()
    light = undefined
  }
  if (!light) {
    light = type === 'spot' ? new SpotLight() : new PointLight()
    if (light instanceof SpotLight) {
      light.target.position.set(0, -1, 0)
      light.add(light.target)
      light.penumbra = 0.4
    }
    light.decay = 2
    group.add(light)
  }
  light.color.set(color)
  light.intensity = intensity
  light.distance = distance
  if (light instanceof SpotLight) light.angle = (angle * Math.PI) / 180
  light.castShadow = castShadow
  light.shadow.mapSize.set(512, 512)
}
