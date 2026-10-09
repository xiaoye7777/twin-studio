import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { newId, type SceneComponentData } from '@twin-studio/core'
import { ComponentRepository, type SceneComponentRecord } from '@/infrastructure/components/ComponentRepository'

const repository = new ComponentRepository()

/** The component library ("我的组件"). */
export const useComponentStore = defineStore('components', () => {
  const components = shallowRef<SceneComponentRecord[]>([])

  async function refresh(): Promise<void> {
    components.value = await repository.list()
  }

  async function add(name: string, data: SceneComponentData, thumbnail?: string): Promise<SceneComponentRecord> {
    const record: SceneComponentRecord = {
      id: newId('component'),
      name,
      createdAt: new Date().toISOString(),
      thumbnail,
      data,
    }
    await repository.save(record)
    await refresh()
    return record
  }

  async function remove(id: string): Promise<void> {
    await repository.remove(id)
    await refresh()
  }

  return { components, refresh, add, remove, get: (id: string) => repository.get(id) }
})
