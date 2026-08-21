import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { AssetMetadata } from '@/infrastructure/assets'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'

export interface AssetImportResult {
  asset: AssetMetadata
  isNew: boolean
}

const repository = new IndexedDbAssetRepository()

export const useAssetStore = defineStore('assets', () => {
  const assets = shallowRef<AssetMetadata[]>([])
  const loading = ref(false)
  const assetRevision = ref(0)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      assets.value = await repository.listMetadata()
      assetRevision.value += 1
    } finally {
      loading.value = false
    }
  }

  async function importAsset(file: File): Promise<AssetImportResult> {
    const knownIds = new Set(assets.value.map((asset) => asset.id))
    const record = await repository.saveFile(file)
    await refresh()
    const asset = assets.value.find((item) => item.id === record.id)
    if (!asset) throw new Error('资产已保存，但无法刷新资产列表')
    return { asset, isNew: !knownIds.has(record.id) }
  }

  return { assets, loading, assetRevision, refresh, importAsset }
})
