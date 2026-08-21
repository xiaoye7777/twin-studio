import type { Object3D } from 'three'
import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import type { TransformState } from '@/editor/history'

export type TransformMode = 'translate' | 'rotate' | 'scale'
export type PrimitiveType = 'box' | 'plane' | 'cylinder'
export type CommonView = 'top' | 'front' | 'right' | 'perspective'
export type TransformChangeSource = 'gizmo' | 'inspector'
export interface EditorActions {
  undo(): void
  redo(): void
  deleteSelected(): void
  duplicateSelected(): void
  toggleVisibility(object: Object3D): void
  resetSelectedTransform(): void
  focusSelected(): void
  fitScene(): void
  setSnap(value: number | null): void
  commitRename(object: Object3D, before: string, after: string): void
  commitTransform(object: Object3D, before: TransformState, after: TransformState): void
  addPrimitive(type: PrimitiveType): void
  instantiateAsset(assetId: string): void
  setCommonView(view: CommonView): void
}

export const useEditorStore = defineStore('editor', () => {
  const selectedObject = shallowRef<Object3D | null>(null)
  const selectedBid = ref<string | null>(null)
  const transformMode = ref<TransformMode>('translate')
  const sceneRoots = shallowRef<Object3D[]>([])
  const sceneRevision = ref(0)
  const transformRevision = ref(0)
  const transformChangeSource = ref<TransformChangeSource | null>(null)
  const modifiedObjects = shallowRef<Object3D[]>([])
  const sceneSaveRevision = ref(0)
  const canUndo = ref(false)
  const canRedo = ref(false)
  const isDirty = ref(false)
  const snapValue = ref<number | null>(null)
  const actions = shallowRef<EditorActions | null>(null)
  const runtimeReady = ref(false)

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

  function markObjectModified(object: Object3D): void {
    if (modifiedObjects.value.includes(object)) return
    modifiedObjects.value = [...modifiedObjects.value, markRaw(object)]
  }

  function notifySceneChanged(object?: Object3D): void {
    if (object) markObjectModified(object)
    sceneRevision.value += 1
  }

  function notifyTransformChanged(source: TransformChangeSource, object?: Object3D): void {
    if (object) markObjectModified(object)
    transformChangeSource.value = source
    transformRevision.value += 1
  }

  function requestSceneSave(): void {
    sceneSaveRevision.value += 1
  }
  function setHistoryState(undo: boolean, redo: boolean): void { canUndo.value = undo; canRedo.value = redo }
  function setDirty(value: boolean): void { isDirty.value = value }
  function setActions(value: EditorActions | null): void {
    actions.value = value ? markRaw(value) : null
    runtimeReady.value = value !== null
  }

  function clearModifiedObjects(): void {
    modifiedObjects.value = []
  }

  return {
    selectedObject,
    selectedBid,
    transformMode,
    sceneRoots,
    sceneRevision,
    transformRevision,
    transformChangeSource,
    modifiedObjects,
    sceneSaveRevision,
    canUndo, canRedo, isDirty, snapValue, runtimeReady,
    selectObject,
    clearSelection,
    setTransformMode,
    setSceneRoots,
    notifySceneChanged,
    notifyTransformChanged,
    markObjectModified,
    requestSceneSave,
    clearModifiedObjects,
    setHistoryState, setDirty, setActions,
    undo: () => actions.value?.undo(),
    redo: () => actions.value?.redo(),
    deleteSelected: () => actions.value?.deleteSelected(),
    duplicateSelected: () => actions.value?.duplicateSelected(),
    toggleVisibility: (object: Object3D) => actions.value?.toggleVisibility(object),
    resetSelectedTransform: () => actions.value?.resetSelectedTransform(),
    focusSelected: () => actions.value?.focusSelected(),
    fitScene: () => actions.value?.fitScene(),
    setSnap: (value: number | null) => { snapValue.value = value; actions.value?.setSnap(value) },
    commitRename: (object: Object3D, before: string, after: string) => actions.value?.commitRename(object, before, after),
    commitTransform: (object: Object3D, before: TransformState, after: TransformState) => actions.value?.commitTransform(object, before, after),
    addPrimitive: (type: PrimitiveType) => actions.value?.addPrimitive(type),
    instantiateAsset: (assetId: string) => actions.value?.instantiateAsset(assetId),
    setCommonView: (view: CommonView) => actions.value?.setCommonView(view),
  }
})
