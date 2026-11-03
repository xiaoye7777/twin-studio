/** 地球上的一个点，单位是度。北纬、东经为正。 */
export interface GeoPoint {
  lat: number
  lon: number
}

export type Vec3 = readonly [number, number, number]

const RAD = Math.PI / 180

/** 经纬度转单位球面坐标，和 three 的 SphereGeometry 贴图方向一致（经度 0 在 +X，北极在 +Y）。 */
export function toVector({ lat, lon }: GeoPoint): Vec3 {
  const cosLat = Math.cos(lat * RAD)
  return [cosLat * Math.cos(lon * RAD), Math.sin(lat * RAD), -cosLat * Math.sin(lon * RAD)]
}

export function toGeoPoint([x, y, z]: Vec3): GeoPoint {
  const length = Math.hypot(x, y, z) || 1
  return { lat: Math.asin(y / length) / RAD, lon: Math.atan2(-z, x) / RAD }
}

/** 两点间的球面夹角（弧度）。 */
export function angleBetween(a: Vec3, b: Vec3): number {
  const cross = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
  return Math.atan2(cross, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])
}

/** 沿大圆在两个单位向量之间插值。正好相对时任选一条路，不会除零。 */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const angle = angleBetween(a, b)
  if (angle < 1e-5) return a
  if (Math.PI - angle < 1e-3) {
    // 对跖点：大圆不唯一，绕一条和 a 垂直的轴转过去
    const axis: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const side = normalize(cross(axis, a))
    const turn = angle * t
    return [
      a[0] * Math.cos(turn) + side[0] * Math.sin(turn),
      a[1] * Math.cos(turn) + side[1] * Math.sin(turn),
      a[2] * Math.cos(turn) + side[2] * Math.sin(turn),
    ]
  }
  const s = Math.sin(angle)
  const wa = Math.sin((1 - t) * angle) / s
  const wb = Math.sin(t * angle) / s
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

export function isValidPoint(value: unknown): value is GeoPoint {
  const point = value as GeoPoint | null
  return (
    !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  )
}

export function formatPoint({ lat, lon }: GeoPoint): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
}
