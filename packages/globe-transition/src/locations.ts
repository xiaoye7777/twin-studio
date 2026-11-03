import { isValidPoint, type GeoPoint } from './geo'

/**
 * 园区在地球上的位置只存在浏览器本地，不写进场景文件：摘掉插件后项目数据里不留痕迹。
 * 代价是换一台电脑要重新定位。
 */
const STORAGE_KEY = 'twin-studio.globe-locations'

function readAll(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function getLocation(projectId: string): GeoPoint | null {
  const point = readAll()[projectId]
  return isValidPoint(point) ? point : null
}

export function setLocation(projectId: string, point: GeoPoint): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [projectId]: point }))
  } catch {
    // 存储不可用时这次仍能飞，只是下次要重新定位
  }
}
