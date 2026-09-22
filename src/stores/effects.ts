import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { cloneEffects, createEffect, isEffectInstance, type EffectInstance, type EffectKind, type EffectParameters } from '@/domain/effects'
import { twinBindingTargetKey, type TwinBindingTarget } from '@/domain/twin'

type Commit = (before: EffectInstance[], after: EffectInstance[], label: string) => void
export const useEffectsStore = defineStore('effects', () => {
  const instances = shallowRef<EffectInstance[]>([])
  let commit: Commit | null = null
  function replace(next: readonly EffectInstance[]): void { instances.value = cloneEffects(next) }
  function configure(action: Commit | null): void { commit = action }
  function add(kind: EffectKind, target: TwinBindingTarget): void {
    // One atom of each kind per target. Parent/child effects remain independent.
    if (instances.value.some(e => e.kind === kind && twinBindingTargetKey(e.target) === twinBindingTargetKey(target))) return
    commit?.(cloneEffects(instances.value), [...cloneEffects(instances.value), createEffect(kind, target)], 'Add effect')
  }
  function update(id: string, parameters: EffectParameters): void {
    const next = instances.value.map(e => e.id === id ? { ...e, parameters: { ...parameters } } : e)
    if (!next.every(isEffectInstance)) return
    commit?.(cloneEffects(instances.value), cloneEffects(next), 'Edit effect')
  }
  function remove(id: string): void { commit?.(cloneEffects(instances.value), cloneEffects(instances.value.filter(e => e.id !== id)), 'Remove effect') }
  function applyBatch(effects: EffectInstance[]): void {
    if (!commit) throw new Error('场景尚未就绪')
    if (!effects.length || !effects.every(isEffectInstance)) throw new Error('特效配置无效')
    const key = (e: EffectInstance) => `${twinBindingTargetKey(e.target)}|${e.kind}`
    const keys = new Set(effects.map(key))
    if (keys.size !== effects.length) throw new Error('重复的目标特效')
    const after = [...instances.value.filter(e => !keys.has(key(e))), ...effects]
    commit(cloneEffects(instances.value), cloneEffects(after), 'Apply effect template')
  }
  return { instances, replace, configure, add, update, remove, applyBatch }
})
