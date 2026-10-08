import { z } from 'zod'
import type { SceneSettingsV1 } from './sceneTypes'

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, { message: '颜色必须是 #RRGGBB 格式' })

/**
 * The authored look of a scene. Devices decide how much of it they can afford (see the engine's quality
 * tiers), but never change it.
 */
export const SceneSettingsSchemaV2 = z.object({
  /** Editor-only helpers; the Viewer never shows them. */
  helpers: z.object({ grid: z.boolean(), axes: z.boolean() }),
  ground: z.object({ enabled: z.boolean(), size: z.number().min(1).max(20000), color: hexColor }),
  sky: z.object({
    /** physical: atmospheric sky that follows the time of day; gradient: stylised; color: flat; hdr: image. */
    mode: z.enum(['physical', 'gradient', 'color', 'hdr']),
    color: hexColor,
    hdrAssetId: z.string().nullable(),
    /** Strength of image-based lighting and reflections. */
    environmentIntensity: z.number().min(0).max(3),
  }),
  time: z.object({
    /** 0–24; drives the sun, sky colours and night lighting. */
    hour: z.number().min(0).max(24),
    /** Degrees; rotates the sun's path around the scene. */
    azimuth: z.number().min(-180).max(180),
  }),
  lighting: z.object({
    ambientIntensity: z.number().min(0).max(5),
    sunIntensity: z.number().min(0).max(10),
    shadows: z.boolean(),
  }),
  /** density is relative haze (0–1): the engine scales it to the scene's size. */
  fog: z.object({ enabled: z.boolean(), density: z.number().min(0).max(1) }),
  post: z.object({
    exposure: z.number().min(0.1).max(4),
    bloom: z.object({
      enabled: z.boolean(),
      intensity: z.number().min(0).max(5),
      /** Luminance above which pixels glow; 1 limits bloom to HDR-bright light (effects, emissive, sun). */
      threshold: z.number().min(0).max(2),
    }),
    vignette: z.boolean(),
    contrast: z.number().min(-1).max(1),
    saturation: z.number().min(-1).max(1),
  }),
  weather: z.object({ kind: z.enum(['none', 'rain', 'snow']), intensity: z.number().min(0).max(1) }),
})

export type SceneSettingsV2 = z.infer<typeof SceneSettingsSchemaV2>
export type SkyMode = SceneSettingsV2['sky']['mode']
export type WeatherKind = SceneSettingsV2['weather']['kind']

export function createDefaultSceneSettingsV2(): SceneSettingsV2 {
  return {
    helpers: { grid: true, axes: false },
    ground: { enabled: true, size: 600, color: '#3a3f44' },
    sky: { mode: 'physical', color: '#20242a', hdrAssetId: null, environmentIntensity: 0.7 },
    time: { hour: 15, azimuth: 30 },
    lighting: { ambientIntensity: 0.6, sunIntensity: 2.4, shadows: true },
    fog: { enabled: true, density: 0.3 },
    post: {
      exposure: 1,
      bloom: { enabled: true, intensity: 0.7, threshold: 1 },
      vignette: true,
      contrast: 0.06,
      saturation: 0.05,
    },
    weather: { kind: 'none', intensity: 0.6 },
  }
}

/** Ready-made looks offered by the editor. */
export const scenePresets: ReadonlyArray<{ id: string; name: string; apply: (s: SceneSettingsV2) => SceneSettingsV2 }> =
  [
    {
      id: 'day',
      name: '晴朗白天',
      apply: s => ({
        ...s,
        sky: { ...s.sky, mode: 'physical' },
        time: { ...s.time, hour: 14 },
        lighting: { ...s.lighting, ambientIntensity: 0.9, sunIntensity: 2.6 },
        fog: { enabled: true, density: 0.25 },
        post: { ...s.post, exposure: 1, bloom: { enabled: true, intensity: 0.5, threshold: 1 } },
      }),
    },
    {
      id: 'dusk',
      name: '黄昏',
      apply: s => ({
        ...s,
        sky: { ...s.sky, mode: 'physical' },
        time: { ...s.time, hour: 18.2 },
        lighting: { ...s.lighting, ambientIntensity: 0.7, sunIntensity: 2.2 },
        fog: { enabled: true, density: 0.35 },
        post: { ...s.post, exposure: 1.1, bloom: { enabled: true, intensity: 0.9, threshold: 0.95 } },
      }),
    },
    {
      id: 'night',
      name: '科技夜景',
      apply: s => ({
        ...s,
        sky: { ...s.sky, mode: 'gradient' },
        time: { ...s.time, hour: 22 },
        lighting: { ...s.lighting, ambientIntensity: 1.1, sunIntensity: 1.2 },
        fog: { enabled: true, density: 0.45 },
        post: { ...s.post, exposure: 1.15, bloom: { enabled: true, intensity: 1.3, threshold: 0.8 } },
      }),
    },
    {
      id: 'studio',
      name: '展台',
      apply: s => ({
        ...s,
        sky: { ...s.sky, mode: 'color', color: '#1d2126' },
        time: { ...s.time, hour: 13 },
        lighting: { ...s.lighting, ambientIntensity: 1.2, sunIntensity: 2.2 },
        fog: { enabled: false, density: s.fog.density },
        post: { ...s.post, exposure: 1, bloom: { enabled: true, intensity: 0.6, threshold: 1 } },
      }),
    },
  ]

/** v1 stored a light direction; v2 stores a time of day. Elevation maps to the morning half of the sun path. */
export function sceneSettingsFromV1(v1: SceneSettingsV1): SceneSettingsV2 {
  const defaults = createDefaultSceneSettingsV2()
  const [x, y, z] = v1.lighting.directionalPosition
  const length = Math.hypot(x, y, z) || 1
  const elevation = Math.asin(Math.max(-1, Math.min(1, y / length)))
  const hour = Math.max(6.5, Math.min(12, 6 + (elevation / (Math.PI / 2)) * 6))
  const azimuth = Math.round((Math.atan2(x, z) * 180) / Math.PI)
  return {
    ...defaults,
    helpers: { grid: v1.gridEnabled, axes: v1.axesEnabled },
    ground: {
      enabled: v1.ground.enabled,
      size: Math.max(1, Math.min(20000, v1.ground.size)),
      color: /^#[0-9a-f]{6}$/i.test(v1.ground.color) ? v1.ground.color : defaults.ground.color,
    },
    sky: {
      ...defaults.sky,
      mode: v1.environmentAssetId ? 'hdr' : 'physical',
      hdrAssetId: v1.environmentAssetId,
    },
    time: { hour: Math.round(hour * 4) / 4, azimuth },
    lighting: {
      ambientIntensity: Math.min(5, v1.lighting.ambientIntensity * 0.6),
      sunIntensity: Math.min(10, v1.lighting.directionalIntensity),
      shadows: true,
    },
  }
}
