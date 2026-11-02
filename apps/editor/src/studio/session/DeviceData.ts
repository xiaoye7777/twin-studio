import {
  type ActiveDataSourceConfig,
  bindingsForSource,
  type DataSourceProbeResult,
  formatRuntimeValue,
  type HttpDataSourceConfig,
  newDataSource,
  newId,
  plain,
  probeDataSource,
  type ProjectDataSource,
  sourceProvides,
  type StaticDataSourceConfig,
  targetForNode,
  type TwinBinding,
  type TwinBindingTarget,
  twinBindingTargetKey,
  type TwinVariableDefinition,
  type WebSocketDataSourceConfig,
} from '@twin-studio/core'
import { sceneSourceHeaders } from '@/screen/datasources/sceneSource'
import { deviceIdFor, deviceVariables, type DeviceTemplate } from '../deviceTemplates'
import type { EditorSession } from '../EditorSession'

/** 场景里的一台设备。设备来自绑定：同一个设备编号可以绑定到多个对象，这里合并成一台。 */
export interface SceneDevice {
  id: string
  name: string
  type?: string
  bindings: TwinBinding[]
  /** 各绑定的变量合并去重。 */
  variables: TwinVariableDefinition[]
}

/** 修改接口配置：除了 id 和类型，其他字段都能改。 */
export type SourcePatch =
  | Partial<Omit<HttpDataSourceConfig, 'id' | 'type'>>
  | Partial<Omit<WebSocketDataSourceConfig, 'id' | 'type'>>
  | Partial<Omit<StaticDataSourceConfig, 'id' | 'type'>>

const sourceNames: Record<ActiveDataSourceConfig['type'], string> = {
  websocket: '推送接口',
  http: '定时请求接口',
  static: '静态数据',
}

/**
 * 设备数据：对象 ↔ 设备的绑定、批量绑定、场景的数据接口（可以同时启用多个）、实时值的显示。
 * 绑定的目标是对象，或选中的模型部件（targetOf）。接口怎么运行在 core 的 TwinDataRuntime。
 */
export class DeviceData {
  constructor(private readonly session: EditorSession) {}

  /** What data, effects and interactions attach to for a node: the selected part of it, or the node. */
  targetOf(nodeId: string): TwinBindingTarget | null {
    const part = this.session.part.value
    if (part?.nodeId === nodeId) return { type: 'asset-node', instanceId: nodeId, assetNodeId: part.assetNodeId }
    const node = this.session.node(nodeId)
    return node ? targetForNode(node) : null
  }

  bindingFor(nodeId: string): TwinBinding | undefined {
    const target = this.targetOf(nodeId)
    if (!target) return undefined
    const key = twinBindingTargetKey(target)
    return this.session.doc.value.bindings.find(binding => twinBindingTargetKey(binding.target) === key)
  }

  setBinding(nodeId: string, update: Omit<TwinBinding, 'id' | 'target'>, coalesceKey?: string): void {
    const target = this.targetOf(nodeId)
    if (!target) return
    this.session.edit(
      '设备绑定',
      draft => {
        const key = twinBindingTargetKey(target)
        const existing = draft.bindings.find(binding => twinBindingTargetKey(binding.target) === key)
        if (existing) {
          existing.device = plain(update.device)
          existing.variables = plain(update.variables)
        } else draft.bindings.push({ id: newId('binding'), target, ...plain(update) })
      },
      { coalesceKey },
    )
  }

  removeBinding(nodeId: string): void {
    const binding = this.bindingFor(nodeId)
    if (!binding) return
    this.session.edit('解除绑定', draft => {
      draft.bindings = draft.bindings.filter(item => item.id !== binding.id)
      draft.visualRules = draft.visualRules.filter(rule => rule.bindingId !== binding.id)
    })
  }

  /** Binds each node to a device of the template, numbering ids from `start`. Returns how many were bound. */
  batchBind(
    nodeIds: readonly string[],
    template: DeviceTemplate,
    prefix: string,
    start: number,
    namePrefix: string,
  ): number {
    const nodes = nodeIds.flatMap(id => this.session.node(id) ?? [])
    if (!nodes.length) return 0
    this.session.edit(`批量绑定 ${nodes.length} 台${template.name}`, draft => {
      nodes.forEach((node, index) => {
        const target = targetForNode(node)
        const key = twinBindingTargetKey(target)
        const number = start + index
        const device = {
          id: deviceIdFor(prefix, number),
          name: `${namePrefix} ${String(number).padStart(2, '0')}`,
          type: template.type,
        }
        const existing = draft.bindings.find(binding => twinBindingTargetKey(binding.target) === key)
        if (existing) {
          existing.device = device
          existing.variables = deviceVariables(template)
        } else draft.bindings.push({ id: newId('binding'), target, device, variables: deviceVariables(template) })
      })
    })
    return nodes.length
  }

  /** 场景里所有设备（按第一次绑定的顺序）。 */
  get devices(): SceneDevice[] {
    const devices = new Map<string, SceneDevice>()
    for (const binding of this.session.doc.value.bindings) {
      const device = devices.get(binding.device.id) ?? {
        id: binding.device.id,
        name: binding.device.name,
        type: binding.device.type,
        bindings: [],
        variables: [],
      }
      device.bindings.push(binding)
      for (const variable of binding.variables)
        if (!device.variables.some(item => item.key === variable.key)) device.variables.push(variable)
      devices.set(device.id, device)
    }
    return [...devices.values()]
  }

  // ---------------------------------------------------------------- 数据接口（场景级，可以同时启用多个）

  /** 所有接口，按列表顺序（也是优先级）。旧版的 mock 不显示。 */
  get sources(): ActiveDataSourceConfig[] {
    return (this.session.doc.value.dataSources ?? []).filter(
      (source): source is ActiveDataSourceConfig => source.type !== 'mock',
    )
  }

  source(id: string): ActiveDataSourceConfig | undefined {
    return this.sources.find(source => source.id === id)
  }

  /** 新建一个接口，返回它的 ID。 */
  addSource(type: ActiveDataSourceConfig['type']): string {
    const id = newId('source')
    this.session.edit('添加数据接口', draft => {
      const sources: ProjectDataSource[] = draft.dataSources ?? []
      const sameType = sources.filter(source => source.type === type).length
      const name = sameType ? `${sourceNames[type]} ${sameType + 1}` : sourceNames[type]
      sources.push({ ...newDataSource(type), id, name })
      draft.dataSources = sources
    })
    return id
  }

  /** 修改一个接口。连续输入用同一个 coalesceKey 合并成一步撤销。 */
  updateSource(id: string, patch: SourcePatch, coalesceKey?: string): void {
    this.session.edit(
      '数据接口设置',
      draft => {
        const source = draft.dataSources?.find(item => item.id === id)
        if (source) Object.assign(source, plain(patch))
      },
      { coalesceKey },
    )
  }

  removeSource(id: string): void {
    this.session.edit('删除数据接口', draft => {
      draft.dataSources = draft.dataSources?.filter(source => source.id !== id)
    })
  }

  /** 复制一个接口（放在它后面），返回新接口的 ID。 */
  duplicateSource(id: string): string | null {
    const original = this.source(id)
    if (!original) return null
    const copy = { ...structuredClone(plain(original)), id: newId('source'), name: `${original.name} 副本` }
    this.session.edit('复制数据接口', draft => {
      const sources = draft.dataSources ?? []
      sources.splice(sources.findIndex(source => source.id === id) + 1, 0, copy)
    })
    return copy.id
  }

  /** 调整顺序：靠前的优先。 */
  moveSource(id: string, delta: -1 | 1): void {
    this.session.edit('调整接口顺序', draft => {
      const sources = draft.dataSources ?? []
      const index = sources.findIndex(source => source.id === id)
      const target = index + delta
      if (index < 0 || target < 0 || target >= sources.length) return
      const [moved] = sources.splice(index, 1)
      sources.splice(target, 0, moved!)
    })
  }

  /** 哪些启用的接口提供这个变量（只看「涉及设备」的范围）。 */
  providersOf(deviceId: string, key: string): ActiveDataSourceConfig[] {
    return this.sources.filter(source => source.enabled && sourceProvides(source, deviceId, key))
  }

  /** 这个变量可以手填时对应的静态接口：范围内第一个启用的静态数据。 */
  staticSourceFor(deviceId: string, key: string): StaticDataSourceConfig | undefined {
    return this.providersOf(deviceId, key).find((source): source is StaticDataSourceConfig => source.type === 'static')
  }

  /** 静态数据：设置一台设备一个变量的值；value 为 null 时删除。 */
  setStaticValue(sourceId: string, deviceId: string, key: string, value: number | string | boolean | null): void {
    const source = this.source(sourceId)
    if (source?.type !== 'static') return
    const values = structuredClone(plain(source.values))
    const device = (values[deviceId] ??= {})
    if (value === null) delete device[key]
    else device[key] = value
    if (!Object.keys(device).length) delete values[deviceId]
    this.updateSource(sourceId, { values }, `static:${sourceId}:${deviceId}:${key}`)
  }

  /** 静态数据：把当前收到的实时值记下来（例如先连网关，再用静态数据演示）。返回记下的个数。 */
  captureStaticValues(sourceId: string): number {
    const values: Record<string, Record<string, number | string | boolean>> = {}
    let count = 0
    for (const binding of this.session.doc.value.bindings)
      for (const variable of binding.variables) {
        const value = this.session.twin.getRuntimeValue(binding.id, variable.key)?.value
        if (value === undefined) continue
        ;(values[binding.device.id] ??= {})[variable.key] = value
        count++
      }
    if (count) this.updateSource(sourceId, { values })
    return count
  }

  /** 试请求：按当前配置请求一次（WebSocket 连上等第一条消息），不影响运行中的接口。 */
  async probeSource(id: string): Promise<DataSourceProbeResult | null> {
    const source = this.source(id)
    if (!source || source.type === 'static') return null
    const bindings = bindingsForSource(source, this.session.doc.value.bindings)
    return probeDataSource(source, bindings, source.type === 'http' ? await sceneSourceHeaders(source) : undefined)
  }

  liveValue(bindingId: string, key: string): string {
    void this.session.twin.runtimeRevision
    const variable = this.session.doc.value.bindings
      .find(binding => binding.id === bindingId)
      ?.variables.find(item => item.key === key)
    return formatRuntimeValue(this.session.twin.getRuntimeValue(bindingId, key)?.value, variable?.unit)
  }

  deviceLines(target: TwinBindingTarget, variables?: readonly string[]) {
    const binding = this.session.twin.getBindingByTarget(target)
    if (!binding) return null
    const shown = variables?.length ? binding.variables.filter(item => variables.includes(item.key)) : binding.variables
    return {
      title: binding.device.name || binding.device.id,
      rows: shown.slice(0, 8).map(item => {
        const value = this.session.twin.getRuntimeValue(binding.id, item.key)?.value
        return `${item.name || item.key}\t${formatRuntimeValue(value, item.unit)}`
      }),
    }
  }
}
