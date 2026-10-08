import { z } from 'zod'
import { nonEmptyString } from '../schemaHelpers'

export const TwinBindingTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('asset-instance'), instanceId: nonEmptyString }),
  z.object({ type: z.literal('asset-node'), instanceId: nonEmptyString, assetNodeId: nonEmptyString }),
  z.object({ type: z.literal('primitive'), nodeId: nonEmptyString }),
  /** Any scene node by id (groups, paths, areas, labels…). Scene format v2. */
  z.object({ type: z.literal('node'), nodeId: nonEmptyString }),
])

export const TwinVariableDataTypeSchema = z.enum(['number', 'boolean', 'string'])

export const TwinVariableDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  dataType: TwinVariableDataTypeSchema,
  unit: z.string().optional(),
})

export const TwinDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
})

/** Binding ids may be empty and are not required to be unique in v1 documents. */
export const TwinBindingSchema = z.object({
  id: z.string(),
  target: TwinBindingTargetSchema,
  device: TwinDeviceSchema,
  variables: z.array(TwinVariableDefinitionSchema),
})
