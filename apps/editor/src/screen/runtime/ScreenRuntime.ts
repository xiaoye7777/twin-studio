import { computed, type InjectionKey, reactive, ref, shallowRef } from 'vue'
import { Object3D } from 'three'
import {
  BindingTargetResolver,
  createTwinState,
  evaluateCondition,
  type SceneDocumentV2,
  TwinDataRuntime,
  type TwinSceneViewerPublicApi,
  type TwinVariableDefinition,
} from '@twin-studio/core'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { ProjectPackageService } from '@/infrastructure/packages/ProjectPackageService'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { useProjectStore } from '@/stores/project'
import { deviceTemplates } from '@/studio/deviceTemplates'
import type { DataBinding, ScreenAction, ScreenDocument, Widget } from '../model'
import { formatDate, formatNumber } from '../widgets/format'
import type { WidgetClick, WidgetData } from '../widgets/types'
import { describeRows, emptyData, staticData } from './staticData'

export interface ScreenDevice {
  id: string
  name: string
  type: string
  bindingId: string
  variables: TwinVariableDefinition[]
}

export interface ScreenAlarm {
  ruleId: string
  deviceId: string
  deviceName: string
  variable: string
  value: unknown
  level: string
}

const typeNames: Record<string, string> = {
  'energy-storage': '储能柜',
  'energy-storage-cabinet': '储能柜',
  photovoltaic: '光伏',
  'wind-turbine': '风机',
  'energy-meter': '电表',
  building: '建筑',
  'ev-charger': '充电桩',
  transformer: '变压器',
}

/** A readable name for a device type id. */
export function deviceTypeName(type: string): string {
  return typeNames[type] ?? (deviceTemplates.find(template => template.type === type)?.name || type || '未分类')
}

/** Every binding counts as present: screens have no 3D objects, only the devices' data. */
class AnyTarget extends BindingTargetResolver {
  private readonly placeholder = new Object3D()
  constructor() {
    super(() => null)
  }
  override resolve(): Object3D {
    return this.placeholder
  }
}

const HISTORY_INTERVAL = 2000
const HISTORY_LIMIT = 900

/**
 * What a rendered screen runs on. It links the screen's 3D project: loads its devices, connects the
 * project's WebSocket source (values only ever come from it), keeps a short history for trend charts and
 * evaluates the project's alarm rules. Widgets get their data from `dataFor`; clicks run through `trigger`,
 * which also drives the 3D views on the screen.
 */
export class ScreenRuntime {
  readonly document = shallowRef<ScreenDocument | null>(null)
  /** Screen pixels per page pixel (the preview's scale); charts render sharp at it. */
  readonly scale = shallowRef(1)
  readonly scene = shallowRef<SceneDocumentV2 | null>(null)
  readonly sceneError = ref('')
  readonly twin = reactive(createTwinState())
  /** The device the screen is about: picked in a 3D view, a table, a chart or a button. */
  readonly selectedDeviceId = ref<string | null>(null)
  readonly historyRevision = ref(0)
  /** 3D views on the screen, for actions such as flying to a view. */
  readonly viewers = new Set<TwinSceneViewerPublicApi>()
  /** Layers (top-level groups) hidden by layer switches on the screen. */
  readonly hiddenLayers = reactive(new Set<string>())
  /** A guided tour is playing in a 3D view on the screen. */
  readonly tourPlaying = ref(false)
  /** The 3D view last moved to, for highlighting the active view button. */
  readonly activeView = ref<string | null>(null)
  private readonly data = new TwinDataRuntime(this.twin, new AnyTarget())
  private packageFor: { projectId: string; blob: Promise<Blob> } | null = null
  private readonly scenes = new LocalSceneRepository()
  private readonly times: number[] = []
  private readonly samples = new Map<string, Array<number | null>>()
  private readonly sampler: ReturnType<typeof setInterval>
  private linked: string | null | undefined = undefined
  private disposed = false

  readonly devices = computed<ScreenDevice[]>(() =>
    (this.scene.value?.bindings ?? []).map(binding => ({
      id: binding.device.id,
      name: binding.device.name || binding.device.id,
      type: binding.device.type ?? '',
      bindingId: binding.id,
      variables: binding.variables,
    })),
  )

  readonly bookmarks = computed(() => (this.scene.value?.bookmarks ?? []).map(({ id, name }) => ({ id, name })))
  readonly tours = computed(() => (this.scene.value?.tours ?? []).map(({ id, name }) => ({ id, name })))
  /** Top-level groups: the scene's zones, used as layers. */
  readonly layers = computed(() =>
    (this.scene.value?.nodes ?? [])
      .filter(node => node.parentId === null && node.kind === 'group')
      .map(({ id, name }) => ({ id, name })),
  )

  readonly alarms = computed<ScreenAlarm[]>(() => {
    void this.twin.runtimeRevision
    const scene = this.scene.value
    if (!scene) return []
    const alarms: ScreenAlarm[] = []
    for (const rule of scene.visualRules) {
      if (!rule.enabled) continue
      const value = this.twin.getRuntimeValue(rule.bindingId, rule.variableKey)?.value
      if (value === undefined || !evaluateCondition(rule.condition, value)) continue
      const device = this.devices.value.find(item => item.bindingId === rule.bindingId)
      const variable = device?.variables.find(item => item.key === rule.variableKey)
      alarms.push({
        ruleId: rule.id,
        deviceId: device?.id ?? '',
        deviceName: device?.name ?? '未知设备',
        variable: variable?.name || rule.variableKey,
        value: variable?.unit && typeof value === 'number' ? `${formatNumber(value, 1)} ${variable.unit}` : value,
        level: rule.template?.name ?? '告警',
      })
    }
    return alarms
  })

  constructor(readonly editing: boolean) {
    this.sampler = setInterval(() => this.sample(), HISTORY_INTERVAL)
  }

  setDocument(document: ScreenDocument): void {
    this.document.value = document
    if (document.sceneProjectId !== this.linked) void this.link(document.sceneProjectId)
  }

  private async link(projectId: string | null): Promise<void> {
    this.linked = projectId
    this.data.stop()
    this.scene.value = null
    this.sceneError.value = ''
    this.times.length = 0
    this.samples.clear()
    if (!projectId) return
    try {
      const scene = await this.scenes.load(projectId)
      if (this.disposed || this.linked !== projectId) return
      if (!scene) {
        this.sceneError.value = '关联的三维项目还没有保存过场景'
        return
      }
      this.scene.value = scene
      this.data.initialize(projectId, scene.bindings)
      this.data.start(scene.dataSources)
    } catch (error) {
      this.sceneError.value = error instanceof Error ? error.message : String(error)
    }
  }

  /** Records every numeric variable, so trend charts have history from the moment the screen opens. */
  private sample(): void {
    const devices = this.devices.value
    if (!devices.length) return
    this.times.push(Date.now())
    for (const device of devices)
      for (const variable of device.variables) {
        if (variable.dataType !== 'number') continue
        const key = `${device.bindingId}|${variable.key}`
        const list = this.samples.get(key) ?? Array<number | null>(this.times.length - 1).fill(null)
        const value = this.twin.getRuntimeValue(device.bindingId, variable.key)?.value
        list.push(typeof value === 'number' ? value : null)
        if (list.length > HISTORY_LIMIT) list.shift()
        this.samples.set(key, list)
      }
    if (this.times.length > HISTORY_LIMIT) this.times.shift()
    this.historyRevision.value++
  }

  /** The linked project as a package for 3D widgets (exported once per project and shared). */
  scenePackage(): Promise<Blob> | null {
    const projectId = this.document.value?.sceneProjectId
    if (!projectId) return null
    if (this.packageFor?.projectId !== projectId) {
      const projects = useProjectStore()
      const project = projects.getProjectById(projectId)
      const service = new ProjectPackageService(new LocalSceneRepository(), new IndexedDbAssetRepository(), projects)
      this.packageFor = {
        projectId,
        blob: project ? service.exportProject(project) : Promise.reject(new Error('关联的三维项目已被删除')),
      }
    }
    return this.packageFor.blob
  }

  device(id: string | null | undefined): ScreenDevice | undefined {
    return id ? this.devices.value.find(device => device.id === id) : undefined
  }

  /** Devices a binding means: listed ids, else every device of a type, else every device. */
  devicesFor(binding: Pick<DataBinding, 'deviceIds' | 'deviceType'>): ScreenDevice[] {
    const all = this.devices.value
    if (binding.deviceIds?.length) return binding.deviceIds.flatMap(id => all.find(device => device.id === id) ?? [])
    return binding.deviceType ? all.filter(device => device.type === binding.deviceType) : all
  }

  value(device: ScreenDevice, key: string): unknown {
    return this.twin.getRuntimeValue(device.bindingId, key)?.value
  }

  // ================================================================ data

  dataFor(widget: Widget): WidgetData | null {
    const binding = widget.data
    if (!binding) return null
    if (binding.source === 'static') return staticData(binding.json)
    void this.twin.runtimeRevision
    const data = emptyData()
    const variableInfo = (devices: ScreenDevice[], key: string) =>
      devices.flatMap(device => device.variables).find(variable => variable.key === key)
    switch (binding.source) {
      case 'device': {
        const device = this.device(binding.deviceId)
        if (device && binding.variable) {
          data.value = this.value(device, binding.variable) ?? null
          const variable = device.variables.find(item => item.key === binding.variable)
          data.labels.value = variable?.name ?? binding.variable
          data.units.value = variable?.unit ?? ''
        }
        return data
      }
      case 'aggregate': {
        const devices = this.devicesFor(binding)
        const key = binding.variable ?? ''
        const values = devices.map(device => this.value(device, key)).filter((v): v is number => typeof v === 'number')
        const mode = binding.aggregate ?? 'sum'
        data.value =
          mode === 'count'
            ? values.length
            : !values.length
              ? null
              : mode === 'sum'
                ? values.reduce((a, b) => a + b, 0)
                : mode === 'avg'
                  ? values.reduce((a, b) => a + b, 0) / values.length
                  : mode === 'max'
                    ? Math.max(...values)
                    : Math.min(...values)
        data.units.value = variableInfo(devices, key)?.unit ?? ''
        return data
      }
      case 'devices': {
        const devices = this.devicesFor(binding)
        const keys = binding.variables?.length ? binding.variables : []
        data.rows = devices.map(device => {
          const row: Record<string, unknown> = { 设备: device.name }
          for (const key of keys) row[key] = this.value(device, key) ?? null
          return row
        })
        data.dimension = '设备'
        data.measures = keys.filter(key => variableInfo(devices, key)?.dataType === 'number')
        for (const key of keys) {
          const variable = variableInfo(devices, key)
          data.labels[key] = variable?.name || key
          data.units[key] = variable?.unit ?? ''
        }
        return data
      }
      case 'history': {
        void this.historyRevision.value
        const devices = this.devicesFor(binding)
        const keys = binding.variables?.length ? binding.variables : binding.variable ? [binding.variable] : []
        const window = Math.max(10, binding.window ?? 300)
        const since = Date.now() - window * 1000
        const start = this.times.findIndex(time => time >= since)
        const times = start < 0 ? [] : this.times.slice(start)
        const columns = devices.flatMap(device =>
          keys.map(key => {
            const variable = device.variables.find(item => item.key === key)
            const name =
              devices.length > 1 && keys.length > 1
                ? `${device.name}·${variable?.name || key}`
                : devices.length > 1
                  ? device.name
                  : variable?.name || key
            const series = this.samples.get(`${device.bindingId}|${key}`) ?? []
            const offset = series.length - this.times.length
            return { name, unit: variable?.unit ?? '', values: times.map((_, i) => series[offset + start + i] ?? null) }
          }),
        )
        data.rows = times.map((time, i) => {
          const row: Record<string, unknown> = { 时间: formatDate(new Date(time), 'HH:mm:ss') }
          for (const column of columns) row[column.name] = column.values[i]
          return row
        })
        data.dimension = '时间'
        data.measures = columns.map(column => column.name)
        for (const column of columns) data.units[column.name] = column.unit
        return data
      }
      case 'alarms': {
        data.rows = this.alarms.value.map(alarm => ({
          设备: alarm.deviceName,
          告警: alarm.level,
          变量: alarm.variable,
          数值: alarm.value,
          deviceId: alarm.deviceId,
        }))
        data.value = data.rows.length
        Object.assign(data, describeRows(data.rows))
        data.dimension = '设备'
        return data
      }
      case 'selected': {
        const device = this.device(this.selectedDeviceId.value)
        data.value = device?.name ?? null
        data.rows =
          device?.variables.map(variable => {
            const value = this.value(device, variable.key)
            return {
              变量: variable.name || variable.key,
              数值:
                typeof value === 'number'
                  ? `${formatNumber(value, 1)}${variable.unit ? ` ${variable.unit}` : ''}`
                  : (value ?? '—'),
            }
          }) ?? []
        data.dimension = '变量'
        return data
      }
      case 'stat': {
        const stat = binding.stat ?? 'devices'
        if (stat === 'devices') data.value = this.devices.value.length
        else if (stat === 'alarms') data.value = this.alarms.value.length
        else
          data.value = this.devices.value.filter(device =>
            device.variables.some(variable => this.value(device, variable.key) !== undefined),
          ).length
        return data
      }
    }
    return data
  }

  // ================================================================ actions

  /** A widget was clicked (in preview / on the big screen). */
  trigger(widget: Widget, click: WidgetClick): void {
    for (const event of widget.events ?? []) void this.run(event.action, click.item)
  }

  /** Runs an action; `$item` in a device id stands for the clicked item (a row, a bar, a button). */
  async run(action: ScreenAction, item?: string): Promise<void> {
    const viewers = [...this.viewers]
    switch (action.type) {
      case 'select-device': {
        const wanted = action.deviceId === '$item' ? item : action.deviceId
        // Items show device names; accept either.
        const device = this.devices.value.find(entry => entry.id === wanted || entry.name === wanted)
        if (!device) return
        this.selectedDeviceId.value = device.id
        for (const viewer of viewers) {
          viewer.selectDevice(device.id)
          void viewer.focusDevice(device.id)
        }
        return
      }
      case 'fly-to-view': {
        const bookmarkId = action.bookmarkId === '$item' ? item : action.bookmarkId
        if (!bookmarkId) return
        this.activeView.value = bookmarkId
        for (const viewer of viewers) void viewer.flyToBookmark(bookmarkId)
        return
      }
      case 'reset-view':
        this.activeView.value = null
        for (const viewer of viewers) void viewer.resetView()
        return
      case 'play-tour':
        this.tourPlaying.value = viewers.length > 0
        for (const viewer of viewers) void viewer.playTour(action.tourId)
        return
      case 'stop-tour':
        this.tourPlaying.value = false
        for (const viewer of viewers) viewer.stopTour()
        return
      case 'toggle-layer': {
        const nodeId = action.nodeId === '$item' ? item : action.nodeId
        if (!nodeId) return
        const hidden = !this.hiddenLayers.has(nodeId)
        if (hidden) this.hiddenLayers.add(nodeId)
        else this.hiddenLayers.delete(nodeId)
        for (const viewer of viewers) viewer.setNodeVisible(nodeId, !hidden)
        return
      }
      case 'open-url':
        if (/^https?:\/\//i.test(action.url)) window.open(action.url, '_blank', 'noopener')
        return
    }
  }

  dispose(): void {
    this.disposed = true
    clearInterval(this.sampler)
    this.data.stop()
    this.viewers.clear()
  }
}

export const ScreenRuntimeKey: InjectionKey<ScreenRuntime> = Symbol('ScreenRuntime')
