import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Points,
  ShaderMaterial,
  type Vector3,
} from 'three'
import type { WeatherKind } from '../domain/scene/sceneSettingsV2'

const BOX = 160
const HEIGHT = 70

const rainShader = {
  vertexShader: /* glsl */ `
    attribute float tip;
    uniform float time;
    varying float vAlpha;
    void main() {
      vec3 p = position;
      p.y = mod(p.y - time * 32.0, ${HEIGHT.toFixed(1)}) + tip * 1.1;
      p.x += tip * 0.12;
      vAlpha = tip > 0.5 ? 0.0 : 0.55;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying float vAlpha;
    void main() { gl_FragColor = vec4(vec3(0.75, 0.82, 0.92), vAlpha); }`,
}

const snowShader = {
  vertexShader: /* glsl */ `
    uniform float time;
    void main() {
      vec3 p = position;
      p.y = mod(p.y - time * 1.6, ${HEIGHT.toFixed(1)});
      p.x += sin(time * 0.6 + position.z) * 0.8;
      p.z += cos(time * 0.5 + position.x) * 0.8;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = clamp(260.0 / -mv.z, 1.0, 9.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    void main() {
      float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.1, d) * 0.85);
    }`,
}

/** Rain and snow around the point of interest; one draw call, animated entirely on the GPU. */
export class Weather {
  readonly object = new Group()
  private visual: Points | LineSegments | null = null
  private material: ShaderMaterial | null = null
  private signature = ''

  configure(kind: WeatherKind, intensity: number): void {
    const signature = `${kind}:${intensity.toFixed(2)}`
    if (signature === this.signature) return
    this.signature = signature
    this.clear()
    if (kind === 'none' || intensity <= 0) return
    const count = Math.round((kind === 'rain' ? 9000 : 5000) * intensity)
    const positions: number[] = []
    const tips: number[] = []
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * BOX
      const y = Math.random() * HEIGHT
      const z = (Math.random() - 0.5) * BOX
      if (kind === 'rain') {
        positions.push(x, y, z, x, y, z)
        tips.push(0, 1)
      } else positions.push(x, y, z)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    if (kind === 'rain') geometry.setAttribute('tip', new Float32BufferAttribute(tips, 1))
    this.material = new ShaderMaterial({
      ...(kind === 'rain' ? rainShader : snowShader),
      uniforms: { time: { value: Math.random() * 100 } },
      transparent: true,
      depthWrite: false,
      blending: kind === 'rain' ? AdditiveBlending : undefined,
    })
    this.visual = kind === 'rain' ? new LineSegments(geometry, this.material) : new Points(geometry, this.material)
    this.visual.frustumCulled = false
    this.visual.raycast = () => {}
    this.object.add(this.visual)
  }

  update(delta: number, focus: Vector3): void {
    if (!this.material) return
    this.material.uniforms.time!.value += delta
    this.object.position.set(focus.x, Math.max(0, focus.y - 10), focus.z)
  }

  private clear(): void {
    this.visual?.removeFromParent()
    this.visual?.geometry.dispose()
    this.material?.dispose()
    this.visual = null
    this.material = null
  }

  dispose(): void {
    this.clear()
  }
}
