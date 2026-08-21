export interface AssetRecord {
  id: string
  fingerprint: string
  name: string
  mimeType: string
  size: number
  lastModified: number
  blob: Blob
  createdAt: string
}

export type AssetMetadata = Omit<AssetRecord, 'blob' | 'fingerprint' | 'lastModified'>

export interface AssetRepository {
  saveFile(file: File): Promise<AssetRecord>
  get(assetId: string): Promise<AssetRecord | null>
  listMetadata(): Promise<AssetMetadata[]>
}
