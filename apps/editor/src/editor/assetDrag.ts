export const ASSET_DRAG_MIME = 'application/x-twin-studio-asset'

export type SceneResourceDragPayload =
  | { type: 'asset'; assetId: string }
  | { type: 'primitive'; presetId: string }

export function writeAssetDragPayload(dataTransfer: DataTransfer, assetId: string): void {
  const payload: SceneResourceDragPayload = { type: 'asset', assetId }
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', assetId)
}

export function writePrimitiveDragPayload(dataTransfer: DataTransfer, presetId: string): void {
  const payload: SceneResourceDragPayload = { type: 'primitive', presetId }
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', presetId)
}

export function readAssetDragPayload(dataTransfer: DataTransfer | null): SceneResourceDragPayload | null {
  if (!dataTransfer) return null
  const raw = dataTransfer.getData(ASSET_DRAG_MIME)
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      ((value.type === 'asset' && 'assetId' in value && typeof value.assetId === 'string') ||
        (value.type === 'primitive' && 'presetId' in value && typeof value.presetId === 'string'))
    ) {
      return value as SceneResourceDragPayload
    }
  } catch {
    return null
  }
  return null
}
