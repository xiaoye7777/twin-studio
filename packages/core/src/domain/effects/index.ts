import { z } from 'zod'
import { nonEmptyString } from '../schemaHelpers'
import { TwinBindingTargetSchema, type TwinBindingTarget } from '../twin'

export const EffectKindSchema = z.enum(['box-glow', 'ground-pulse', 'outline', 'child-highlight', 'floating-label'])

export const EffectParametersSchema = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i, { message: '颜色必须是 #RRGGBB 格式' }),
  opacity: z.number().min(0).max(1),
  speed: z.number().min(0).max(10),
  padding: z.number().min(0).max(100),
  text: z.string().max(200),
})

export const EffectInstanceSchema = z.object({
  id: nonEmptyString,
  kind: EffectKindSchema,
  target: TwinBindingTargetSchema,
  parameters: EffectParametersSchema,
  /** Provenance only: never resolved by the runtime or automatically synchronized. */
  sourceTemplateId: nonEmptyString.optional(),
})

export type EffectKind = z.infer<typeof EffectKindSchema>
export type EffectParameters = z.infer<typeof EffectParametersSchema>
export type EffectInstance = z.infer<typeof EffectInstanceSchema>
export interface EffectDefinition {
  kind: EffectKind
  name: string
  category: '告警' | '高亮' | '标注'
  fields: readonly (keyof EffectParameters)[]
}
export const effectDefinitions: readonly EffectDefinition[] = [
  { kind: 'box-glow', name: '呼吸光框', category: '告警', fields: ['color', 'opacity', 'speed', 'padding'] },
  { kind: 'ground-pulse', name: '地面脉冲', category: '告警', fields: ['color', 'opacity', 'speed', 'padding'] },
  { kind: 'outline', name: 'Outline 描边', category: '高亮', fields: [] },
  { kind: 'child-highlight', name: '局部高亮', category: '高亮', fields: ['color', 'opacity'] },
  { kind: 'floating-label', name: '悬浮标注', category: '标注', fields: ['color', 'opacity', 'padding', 'text'] },
]
export function createEffect(kind: EffectKind, target: TwinBindingTarget): EffectInstance {
  return {
    id: `effect_${crypto.randomUUID()}`,
    kind,
    target: { ...target },
    parameters: createEffectParameters(),
  }
}
export function createEffectParameters(): EffectParameters {
  return { color: '#ffb020', opacity: 0.65, speed: 1, padding: 0.2, text: '设备标注' }
}
export function cloneEffects(effects: readonly EffectInstance[]): EffectInstance[] {
  return effects.map(effect => ({ ...effect, target: { ...effect.target }, parameters: { ...effect.parameters } }))
}
export function isEffectInstance(value: unknown): value is EffectInstance {
  return EffectInstanceSchema.safeParse(value).success
}
export function isEffectParameters(value: unknown): value is EffectParameters {
  return EffectParametersSchema.safeParse(value).success
}
