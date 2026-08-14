import type { Object3D } from 'three'
import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'

export type TransformMode = 'translate' | 'rotate' | 'scale'

export const useEditorStore = defineStore('editor', () => {
  const selectedObject = shallowRef<Object3D | null>(null)
  const selectedBid = ref<string | null>(null)
  const transformMode = ref<TransformMode>('translate')

  function selectObject(object: Object3D): void {
    selectedObject.value = markRaw(object)
    selectedBid.value = typeof object.userData.bid === 'string' ? object.userData.bid : null
  }

  function clearSelection(): void {
    selectedObject.value = null
    selectedBid.value = null
  }

  function setTransformMode(mode: TransformMode): void {
    transformMode.value = mode
  }

  return {
    selectedObject,
    selectedBid,
    transformMode,
    selectObject,
    clearSelection,
    setTransformMode,
  }
})
