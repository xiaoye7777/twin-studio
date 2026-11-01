import {
  type ActiveDataSourceConfig,
  formatRuntimeValue,
  newDataSource,
  newId,
  plain,
  type ProjectDataSource,
  targetForNode,
  type TwinBinding,
  type TwinBindingTarget,
  twinBindingTargetKey,
} from '@twin-studio/core'
import { deviceIdFor, deviceVariables, type DeviceTemplate } from '../deviceTemplates'
import type { EditorSession } from '../EditorSession'

/**
 * 设备数据：对象 ↔ 设备的绑定、批量绑定、场景数据源（推送 / 定时请求 / 静态数据）、实时值的显示。
 * 绑定的目标是对象，或选中的模型部件（targetOf）。
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

  // ---------------------------------------------------------------- 数据源（场景级，最多启用一个）

  /** 当前启用的数据源；没有启用时为 null。 */
  get activeSource(): ActiveDataSourceConfig | null {
    return (
      this.session.doc.value.dataSources?.find(
        (source): source is ActiveDataSourceConfig => source.enabled && source.type !== 'mock',
      ) ?? null
    )
  }

  /** 某种类型的数据源配置（启用或未启用），没有时为 undefined。 */
  dataSourceOf<T extends ActiveDataSourceConfig['type']>(
    type: T,
  ): Extract<ActiveDataSourceConfig, { type: T }> | undefined {
    return this.session.doc.value.dataSources?.find(source => source.type === type) as
      Extract<ActiveDataSourceConfig, { type: T }> | undefined
  }

  /** 启用某种数据源（以前配置过就沿用，没有就新建默认配置），其他的全部停用；null = 全部停用。 */
  useDataSource(type: ActiveDataSourceConfig['type'] | null): void {
    this.session.edit('数据源', draft => {
      const sources: ProjectDataSource[] = draft.dataSources ?? []
      if (type && !sources.some(source => source.type === type)) sources.push(newDataSource(type))
      for (const source of sources) source.enabled = source.type === type
      draft.dataSources = sources
    })
  }

  /** 修改某种数据源的设置（不改变启用状态）。连续输入用同一个 coalesceKey 合并成一步撤销。 */
  updateDataSource<T extends ActiveDataSourceConfig['type']>(
    type: T,
    patch: Partial<Omit<Extract<ActiveDataSourceConfig, { type: T }>, 'type' | 'id'>>,
    coalesceKey?: string,
  ): void {
    this.session.edit(
      '数据源设置',
      draft => {
        const sources: ProjectDataSource[] = draft.dataSources ?? []
        let source = sources.find(item => item.type === type)
        if (!source) {
          source = { ...newDataSource(type), enabled: false }
          sources.push(source)
        }
        Object.assign(source, plain(patch))
        draft.dataSources = sources
      },
      { coalesceKey },
    )
  }

  /** 旧接口：设置 WebSocket 地址并启用 / 停用。 */
  setDataSource(url: string, enabled: boolean): void {
    this.updateDataSource('websocket', { url })
    if (enabled) this.useDataSource('websocket')
    else if (this.activeSource?.type === 'websocket') this.useDataSource(null)
  }

  /** 静态数据：设置一台设备一个变量的值；value 为 null 时删除。 */
  setStaticValue(deviceId: string, key: string, value: number | string | boolean | null): void {
    const values = structuredClone(plain(this.dataSourceOf('static')?.values ?? {}))
    const device = (values[deviceId] ??= {})
    if (value === null) delete device[key]
    else device[key] = value
    if (!Object.keys(device).length) delete values[deviceId]
    this.updateDataSource('static', { values }, `static:${deviceId}:${key}`)
  }

  /** 静态数据：把当前收到的实时值记下来作为静态值（例如先连网关，再切到静态数据演示）。 */
  captureStaticValues(): number {
    const values: Record<string, Record<string, number | string | boolean>> = {}
    let count = 0
    for (const binding of this.session.doc.value.bindings)
      for (const variable of binding.variables) {
        const value = this.session.twin.getRuntimeValue(binding.id, variable.key)?.value
        if (value === undefined) continue
        ;(values[binding.device.id] ??= {})[variable.key] = value
        count++
      }
    if (count) this.updateDataSource('static', { values })
    return count
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
