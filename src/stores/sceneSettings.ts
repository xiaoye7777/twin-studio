import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  cloneSceneSettings,
  createDefaultSceneSettings,
  type SceneSettingsV1,
  type Vector3Tuple,
} from '@/domain/scene'
import { useEditorStore } from './editor'

export const useSceneSettingsStore = defineStore('scene-settings', () => {
  const projectId = ref<string | null>(null)
  const settings = ref<SceneSettingsV1>(createDefaultSceneSettings())
  const revision = ref(0)
  const panelOpen = ref(false)

  function initializeProject(nextProjectId: string, saved?: SceneSettingsV1): void {
    projectId.value = nextProjectId
    settings.value = cloneSceneSettings(saved ?? createDefaultSceneSettings())
    revision.value += 1
  }

  function resetProject(leavingProjectId: string): void {
    if (projectId.value !== leavingProjectId) return
    projectId.value = null
    settings.value = createDefaultSceneSettings()
    panelOpen.value = false
    revision.value += 1
  }

  function commit(mutator: (draft: SceneSettingsV1) => void): void {
    const draft = cloneSceneSettings(settings.value)
    mutator(draft)
    settings.value = draft
    revision.value += 1
    useEditorStore().setDirty(true)
  }

  function setGridEnabled(enabled: boolean): void {
    commit((draft) => { draft.gridEnabled = enabled })
  }

  function setAxesEnabled(enabled: boolean): void {
    commit((draft) => { draft.axesEnabled = enabled })
  }

  function setGroundEnabled(enabled: boolean): void {
    commit((draft) => { draft.ground.enabled = enabled })
  }

  function setGroundSize(size: number): void {
    if (!Number.isFinite(size) || size <= 0) return
    commit((draft) => { draft.ground.size = size })
  }

  function setGroundColor(color: string): void {
    commit((draft) => { draft.ground.color = color })
  }

  function setAmbientIntensity(intensity: number): void {
    if (!Number.isFinite(intensity) || intensity < 0) return
    commit((draft) => { draft.lighting.ambientIntensity = intensity })
  }

  function setDirectionalIntensity(intensity: number): void {
    if (!Number.isFinite(intensity) || intensity < 0) return
    commit((draft) => { draft.lighting.directionalIntensity = intensity })
  }

  function setDirectionalPosition(position: Vector3Tuple): void {
    if (!position.every(Number.isFinite)) return
    commit((draft) => { draft.lighting.directionalPosition = [...position] })
  }

  function setEnvironmentAssetId(assetId: string | null): void {
    commit((draft) => { draft.environmentAssetId = assetId })
  }

  function togglePanel(): void { panelOpen.value = !panelOpen.value }
  function closePanel(): void { panelOpen.value = false }

  return {
    projectId,
    settings,
    revision,
    panelOpen,
    initializeProject,
    resetProject,
    setGridEnabled,
    setAxesEnabled,
    setGroundEnabled,
    setGroundSize,
    setGroundColor,
    setAmbientIntensity,
    setDirectionalIntensity,
    setDirectionalPosition,
    setEnvironmentAssetId,
    togglePanel,
    closePanel,
  }
})
