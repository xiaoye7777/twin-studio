import { computed, ref, shallowRef } from 'vue'
import type { TwinSceneViewerPublicApi, ViewerInteractionEvent, ViewerRuntimeState, ViewerSelection } from '@twin-studio/viewer'

export interface DeviceView { id:string; name:string; status:string; alarm:boolean; resolved:boolean; values:Record<string,number|boolean|string|undefined> }

export function useTwinDashboard() {
  const viewerRef = ref<TwinSceneViewerPublicApi | null>(null)
  const runtime = shallowRef<ViewerRuntimeState | null>(null)
  const selectedDeviceId = ref<string | null>(null)
  const lastEvent = shallowRef<ViewerInteractionEvent | null>(null)
  const loadStatus = ref('正在加载园区项目包…')
  const devices = computed<DeviceView[]>(() => {
    const state = runtime.value
    if (!state) return []
    void state.bindingRevision; void state.runtimeRevision; void state.resolutionRevision
    return state.bindings.map(binding => {
      const values = Object.fromEntries(binding.variables.map(variable => [variable.key, state.getRuntimeValue(binding.id, variable.key)?.value]))
      return { id:binding.device.id, name:binding.device.name, values, alarm:values.alarm === true,
        status:typeof values.status === 'string' ? values.status : 'waiting', resolved:state.resolutionByBindingId[binding.id] === 'resolved' }
    })
  })
  const selected = computed(() => devices.value.find(device => device.id === selectedDeviceId.value) ?? null)
  const summary = computed(() => {
    const numbers = (key:string) => devices.value.flatMap(device => typeof device.values[key] === 'number' ? [device.values[key] as number] : [])
    const average = (key:string) => { const list=numbers(key); return list.length ? list.reduce((a,b)=>a+b,0)/list.length : 0 }
    return { total:devices.value.length, online:devices.value.filter(device => device.resolved && device.status !== 'offline').length,
      alarms:devices.value.filter(device => device.alarm).length, soc:average('soc'), temperature:average('temperature'),
      power:numbers('power').reduce((a,b)=>a+b,0) }
  })
  const connection = computed(() => ({
    type: runtime.value?.dataSourceType ?? 'mock',
    status: runtime.value?.dataSourceStatus ?? 'disconnected',
    messages: runtime.value?.dataSourceMessageCount ?? 0,
    error: runtime.value?.dataSourceError ?? null,
  }))
  function handleLoaded(event:{projectName:string;objectCount:number;bindingCount:number}) {
    runtime.value = viewerRef.value?.getRuntimeState() ?? null
    loadStatus.value = `${event.projectName} · ${event.objectCount} 个对象 · ${event.bindingCount} 个设备绑定`
  }
  function handleSelection(selection:ViewerSelection) { selectedDeviceId.value = selection?.deviceId ?? null }
  function handleInteraction(event:ViewerInteractionEvent) { lastEvent.value = event }
  async function chooseDevice(deviceId:string) {
    if (viewerRef.value?.selectDevice(deviceId)) await viewerRef.value.focusDevice(deviceId)
  }
  function clearSelection() { viewerRef.value?.clearSelection() }
  return { viewerRef, runtime, selectedDeviceId, lastEvent, loadStatus, devices, selected, summary, connection,
    handleLoaded, handleSelection, handleInteraction, chooseDevice, clearSelection }
}
