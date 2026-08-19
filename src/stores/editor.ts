import type { Object3D } from 'three'
import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'

export type TransformMode = 'translate' | 'rotate' | 'scale'
export type TransformChangeSource = 'gizmo' | 'inspector'

export const useEditorStore = defineStore('editor', () => {
  const selectedObject = shallowRef<Object3D | null>(null)
  const selectedBid = ref<string | null>(null)
  const transformMode = ref<TransformMode>('translate')
  const sceneRoots = shallowRef<Object3D[]>([])
  const sceneRevision = ref(0)
  const transformRevision = ref(0)
  const transformChangeSource = ref<TransformChangeSource | null>(null)

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

  function setSceneRoots(objects: readonly Object3D[]): void {
    sceneRoots.value = objects.map((object) => markRaw(object))
    sceneRevision.value += 1
  }

  function notifySceneChanged(): void {
    sceneRevision.value += 1
  }

  function notifyTransformChanged(source: TransformChangeSource): void {
    transformChangeSource.value = source
    transformRevision.value += 1
  }

  return {
    selectedObject,
    selectedBid,
    transformMode,
    sceneRoots,
    sceneRevision,
    transformRevision,
    transformChangeSource,
    selectObject,
    clearSelection,
    setTransformMode,
    setSceneRoots,
    notifySceneChanged,
    notifyTransformChanged,
  }
})
