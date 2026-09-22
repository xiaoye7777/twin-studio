import type {
  TwinBindingResolution,
  TwinDevice,
  TwinRuntimeValue,
  TwinRuntimeValueData,
  TwinVariableDataType,
  TwinVariableDefinition,
} from '@/domain/twin'

export type DashboardDeviceStatusKind = 'alarm' | 'normal' | 'unresolved' | 'waiting'

export interface DashboardVariableView {
  id: string
  bindingId: string
  key: string
  name: string
  dataType: TwinVariableDataType
  unit?: string
  value?: TwinRuntimeValueData
  updatedAt?: string
}

export interface DashboardDeviceView {
  id: string
  name: string
  type?: string
  bindingIds: string[]
  variables: DashboardVariableView[]
  resolved: boolean
  alarm: boolean
  status: string
  statusKind: DashboardDeviceStatusKind
}

interface DashboardBindingSource {
  readonly id: string
  readonly device: Readonly<TwinDevice>
  readonly variables: readonly Readonly<TwinVariableDefinition>[]
}

function runtimeValueKey(bindingId: string, variableKey: string): string {
  return `${bindingId}:${variableKey}`
}

function isAlarmVariable(variable: DashboardVariableView): boolean {
  const identity = `${variable.key} ${variable.name}`.toLowerCase()
  return variable.dataType === 'boolean' && identity.includes('alarm')
}

function resolveStatus(device: DashboardDeviceView): Pick<DashboardDeviceView, 'alarm' | 'status' | 'statusKind'> {
  const alarm = device.variables.some((variable) => isAlarmVariable(variable) && variable.value === true)
  if (alarm) return { alarm: true, status: '告警', statusKind: 'alarm' }
  if (!device.resolved) return { alarm: false, status: '目标未解析', statusKind: 'unresolved' }
  const statusVariable = device.variables.find((variable) => variable.key.toLowerCase() === 'status' && typeof variable.value === 'string')
  if (statusVariable) return { alarm: false, status: String(statusVariable.value), statusKind: 'normal' }
  const hasRuntimeValue = device.variables.some((variable) => variable.value !== undefined)
  return hasRuntimeValue
    ? { alarm: false, status: '正常', statusKind: 'normal' }
    : { alarm: false, status: '等待数据', statusKind: 'waiting' }
}

/** Builds a read-only presentation projection from the live per-viewer Twin Runtime. */
export function buildDashboardDevices(
  bindings: readonly DashboardBindingSource[],
  runtimeValues: Readonly<Record<string, TwinRuntimeValue>>,
  resolutionByBindingId: Readonly<Record<string, TwinBindingResolution>>,
): DashboardDeviceView[] {
  const devices = new Map<string, DashboardDeviceView>()
  for (const binding of bindings) {
    let device = devices.get(binding.device.id)
    if (!device) {
      device = {
        id: binding.device.id,
        name: binding.device.name,
        type: binding.device.type,
        bindingIds: [],
        variables: [],
        resolved: false,
        alarm: false,
        status: '等待数据',
        statusKind: 'waiting',
      }
      devices.set(binding.device.id, device)
    }
    device.bindingIds.push(binding.id)
    device.resolved ||= resolutionByBindingId[binding.id] === 'resolved'
    for (const variable of binding.variables) {
      const runtime = runtimeValues[runtimeValueKey(binding.id, variable.key)]
      device.variables.push({
        id: `${binding.id}:${variable.id}`,
        bindingId: binding.id,
        key: variable.key,
        name: variable.name,
        dataType: variable.dataType,
        unit: variable.unit,
        value: runtime?.value,
        updatedAt: runtime?.updatedAt,
      })
    }
  }
  return [...devices.values()]
    .map((device) => ({ ...device, ...resolveStatus(device) }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}
