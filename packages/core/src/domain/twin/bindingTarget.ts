import type { z } from 'zod'
import { TwinBindingTargetSchema } from './schema'

export type TwinBindingTarget = z.infer<typeof TwinBindingTargetSchema>

export function twinBindingTargetKey(target: TwinBindingTarget): string {
  if (target.type === 'asset-instance') return `asset-instance:${target.instanceId}`
  if (target.type === 'asset-node') return `asset-node:${target.instanceId}:${target.assetNodeId}`
  return `primitive:${target.nodeId}`
}

export function isTwinBindingTarget(value: unknown): value is TwinBindingTarget {
  return TwinBindingTargetSchema.safeParse(value).success
}
