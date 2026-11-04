export const ASSET_DRAG_MIME = 'application/x-twin-studio-asset'

export type SceneResourceDragPayload =
  | { type: 'asset'; assetId: string }
  | { type: 'primitive'; presetId: string }
  | { type: 'builtin'; modelKey: string }
  | { type: 'component'; componentId: string }

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

export function writeBuiltinModelDragPayload(dataTransfer: DataTransfer, modelKey: string): void {
  const payload: SceneResourceDragPayload = { type: 'builtin', modelKey }
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', modelKey)
}

export function writeComponentDragPayload(dataTransfer: DataTransfer, componentId: string): void {
  const payload: SceneResourceDragPayload = { type: 'component', componentId }
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', componentId)
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
        (value.type === 'primitive' && 'presetId' in value && typeof value.presetId === 'string') ||
        (value.type === 'builtin' && 'modelKey' in value && typeof value.modelKey === 'string') ||
        (value.type === 'component' && 'componentId' in value && typeof value.componentId === 'string'))
    ) {
      return value as SceneResourceDragPayload
    }
  } catch {
    return null
  }
  return null
}
