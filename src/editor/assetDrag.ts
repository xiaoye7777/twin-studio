export const ASSET_DRAG_MIME = 'application/x-twin-studio-asset'

interface AssetDragPayload {
  type: 'asset'
  assetId: string
}

export function writeAssetDragPayload(dataTransfer: DataTransfer, assetId: string): void {
  const payload: AssetDragPayload = { type: 'asset', assetId }
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', assetId)
}

export function readAssetDragPayload(dataTransfer: DataTransfer | null): AssetDragPayload | null {
  if (!dataTransfer) return null
  const raw = dataTransfer.getData(ASSET_DRAG_MIME)
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      value.type === 'asset' &&
      'assetId' in value &&
      typeof value.assetId === 'string'
    ) {
      return value as AssetDragPayload
    }
  } catch {
    return null
  }
  return null
}
