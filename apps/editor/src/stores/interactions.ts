import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { cloneInteractions, isSceneInteraction, type SceneInteraction } from '@/domain/interactions'
import type { InteractionDiagnostics } from '@/runtime/interactions/InteractionRuntime'

type Commit = (before: SceneInteraction[], after: SceneInteraction[], label: string) => void

export const useInteractionsStore = defineStore('interactions', () => {
  const interactions = shallowRef<SceneInteraction[]>([])
  const diagnostics = shallowRef<InteractionDiagnostics>({ total: 0, enabled: 0, unresolved: [], hoverTarget: null, pointerActive: false })
  let commit: Commit | null = null
  function configure(value: Commit | null): void { commit = value }
  function replace(values: readonly SceneInteraction[]): void { interactions.value = cloneInteractions(values) }
  function save(value: SceneInteraction): void {
    if (!isSceneInteraction(value)) throw new Error('交互配置无效')
    const exists = interactions.value.some(item => item.id === value.id)
    const next = exists ? interactions.value.map(item => item.id === value.id ? value : item) : [...interactions.value, value]
    commit?.(cloneInteractions(interactions.value), cloneInteractions(next), exists ? 'Edit interaction' : 'Add interaction')
  }
  function remove(id: string): void { commit?.(cloneInteractions(interactions.value), cloneInteractions(interactions.value.filter(item => item.id !== id)), 'Delete interaction') }
  function publish(value: InteractionDiagnostics): void { diagnostics.value = structuredClone(value) }
  return { interactions, diagnostics, configure, replace, save, remove, publish }
})
