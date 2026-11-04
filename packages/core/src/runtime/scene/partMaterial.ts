import { Color, type Material, type MeshStandardMaterial, type Texture } from 'three'
import type { PartMaterial } from '../../domain/scene'

type Look = Partial<
  Pick<MeshStandardMaterial, 'color' | 'emissive' | 'emissiveIntensity' | 'metalness' | 'roughness'>
> & {
  map?: Texture | null
}

/**
 * Sets `target` (a copy of `source`) to `source` with a part's material override on top. Works with any
 * material type: properties a material does not have are skipped.
 */
export function applyPartMaterial(target: Material, source: Material, look: PartMaterial): void {
  const to = target as Material & Look
  const from = source as Material & Look
  if (to.color instanceof Color && from.color instanceof Color) {
    to.color.copy(from.color)
    if (look.color) to.color.set(look.color)
  }
  if ('map' in to) {
    const map = look.texture === false ? null : (from.map ?? null)
    if (to.map !== map) {
      to.map = map
      target.needsUpdate = true
    }
  }
  const fading = look.opacity !== undefined && look.opacity < 1
  const transparent = source.transparent || fading
  if (target.transparent !== transparent) {
    target.transparent = transparent
    target.needsUpdate = true
  }
  target.opacity = source.opacity * (look.opacity ?? 1)
  // See-through shells must not hide what is inside them.
  target.depthWrite = fading ? false : source.depthWrite
  if (typeof to.metalness === 'number') to.metalness = look.metalness ?? from.metalness ?? to.metalness
  if (typeof to.roughness === 'number') to.roughness = look.roughness ?? from.roughness ?? to.roughness
  if (to.emissive instanceof Color && from.emissive instanceof Color) {
    to.emissive.copy(from.emissive)
    to.emissiveIntensity = from.emissiveIntensity ?? 1
    if (look.emissive) {
      to.emissive.set(look.emissive)
      to.emissiveIntensity = look.emissiveIntensity ?? 1
    }
  }
}
