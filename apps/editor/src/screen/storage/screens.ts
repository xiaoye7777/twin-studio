import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { newScreenId, type ScreenDocument } from '../model'
import { screenRepository } from './ScreenRepository'

/** The data screen list (数据大屏). */
export const useScreenStore = defineStore('screens', () => {
  const screens = shallowRef<ScreenDocument[]>([])
  const loaded = shallowRef(false)

  async function refresh(): Promise<void> {
    screens.value = await screenRepository.list()
    loaded.value = true
  }

  async function save(document: ScreenDocument): Promise<void> {
    await screenRepository.save(document)
    await refresh()
  }

  async function duplicate(document: ScreenDocument): Promise<ScreenDocument> {
    const now = new Date().toISOString()
    const copy: ScreenDocument = {
      ...JSON.parse(JSON.stringify(document)),
      id: newScreenId(),
      name: `${document.name} 副本`,
      createdAt: now,
      updatedAt: now,
    }
    await save(copy)
    return copy
  }

  async function remove(id: string): Promise<void> {
    await screenRepository.remove(id)
    await refresh()
  }

  return { screens, loaded, refresh, save, duplicate, remove }
})
