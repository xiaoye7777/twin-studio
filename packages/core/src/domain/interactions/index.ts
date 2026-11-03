import { z } from 'zod'
import { isRecord, nonEmptyString } from '../schemaHelpers'
import { TwinBindingTargetSchema, type TwinBindingTarget } from '../twin'

export type InteractionMetadataValue =
  string | number | boolean | null | InteractionMetadataValue[] | { [key: string]: InteractionMetadataValue }
export type InteractionMetadata = Record<string, InteractionMetadataValue>

/** Finite JSON values nested at most 10 levels deep: metadata is handed to host pages verbatim. */
function isJsonValue(value: unknown, depth = 0): value is InteractionMetadataValue {
  if (depth > 10) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(item => isJsonValue(item, depth + 1))
  return isRecord(value) && Object.values(value).every(item => isJsonValue(item, depth + 1))
}

const InteractionMetadataSchema = z.custom<InteractionMetadata>(value => isRecord(value) && isJsonValue(value), {
  message: '附加数据必须是 JSON 对象，且嵌套不超过 10 层',
})

export const InteractionTriggerSchema = z.enum(['click', 'double-click', 'hover-enter', 'hover-leave'])

/**
 * 交互触发动画片段的方式。toggle：正放并停在结尾，再触发一次倒放回去（开门 / 关门、爆炸 / 复位）；
 * once：每次从头放，停在结尾；loop：循环播放，再触发一次停止。
 */
export const AnimationPlayModeSchema = z.enum(['toggle', 'once', 'loop'])
export type AnimationPlayMode = z.infer<typeof AnimationPlayModeSchema>
export const animationPlayModes: readonly AnimationPlayMode[] = AnimationPlayModeSchema.options
export const animationPlayModeLabels: Record<AnimationPlayMode, string> = {
  toggle: '往返切换（再触发一次倒放回去）',
  once: '播放一次（停在最后一帧）',
  loop: '循环（再触发一次停止）',
}

// An explicit target is optional on every action; without one the action applies to the source.
const actionTarget = TwinBindingTargetSchema.optional()
export const InteractionActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('select'), target: actionTarget }),
  z.object({ type: z.literal('clear-selection'), target: actionTarget }),
  z.object({ type: z.literal('focus'), target: actionTarget }),
  z.object({
    type: z.literal('emit-event'),
    target: actionTarget,
    eventName: z.string().regex(/^[a-z][a-z0-9._:-]{0,63}$/i, {
      message: '事件名需以字母开头，只能包含字母、数字和 . _ : -，最多 64 个字符',
    }),
    metadata: InteractionMetadataSchema.optional(),
  }),
  z.object({ type: z.literal('show'), target: actionTarget }),
  z.object({ type: z.literal('hide'), target: actionTarget }),
  z.object({ type: z.literal('highlight'), target: actionTarget }),
  z.object({ type: z.literal('toggle'), target: actionTarget }),
  z.object({ type: z.literal('fly-to-bookmark'), target: actionTarget, bookmarkId: nonEmptyString }),
  z.object({ type: z.literal('play-tour'), target: actionTarget, tourId: nonEmptyString }),
  z.object({ type: z.literal('stop-tour'), target: actionTarget }),
  z.object({
    type: z.literal('play-animation'),
    target: actionTarget,
    clip: nonEmptyString,
    mode: AnimationPlayModeSchema,
  }),
  // 不写 clip：停止这个模型所有由交互触发的片段，部件回到原来的姿态
  z.object({ type: z.literal('stop-animation'), target: actionTarget, clip: nonEmptyString.optional() }),
])

export const SceneInteractionSchema = z
  .object({
    id: nonEmptyString,
    enabled: z.boolean(),
    source: TwinBindingTargetSchema,
    trigger: InteractionTriggerSchema,
    action: InteractionActionSchema,
  })
  .refine(value => value.action.type !== 'highlight' || value.trigger === 'hover-enter', {
    message: '临时高亮只能由悬停进入触发',
    path: ['trigger'],
  })

export type InteractionTrigger = z.infer<typeof InteractionTriggerSchema>
export type InteractionAction = z.infer<typeof InteractionActionSchema>
export type InteractionActionType = InteractionAction['type']
export type SceneInteraction = z.infer<typeof SceneInteractionSchema>

export const interactionTriggers: readonly InteractionTrigger[] = InteractionTriggerSchema.options
export const interactionActionTypes = [
  'select',
  'clear-selection',
  'focus',
  'emit-event',
  'show',
  'hide',
  'toggle',
  'highlight',
  'fly-to-bookmark',
  'play-tour',
  'stop-tour',
  'play-animation',
  'stop-animation',
] as const satisfies readonly InteractionActionType[]

export const interactionTriggerLabels: Record<InteractionTrigger, string> = {
  click: '单击',
  'double-click': '双击',
  'hover-enter': '鼠标移入',
  'hover-leave': '鼠标移出',
}

export const interactionActionLabels: Record<InteractionActionType, string> = {
  select: '选中',
  'clear-selection': '取消选中',
  focus: '镜头聚焦',
  'emit-event': '通知大屏',
  show: '显示',
  hide: '隐藏',
  toggle: '切换显隐',
  highlight: '临时高亮',
  'fly-to-bookmark': '飞到视角',
  'play-tour': '播放导览',
  'stop-tour': '停止导览',
  'play-animation': '播放动画',
  'stop-animation': '停止动画并复位',
}

export function createInteraction(source: TwinBindingTarget): SceneInteraction {
  return {
    id: `interaction_${crypto.randomUUID()}`,
    enabled: true,
    source: { ...source },
    trigger: 'click',
    action: { type: 'select' },
  }
}

export function cloneInteractions(values: readonly SceneInteraction[]): SceneInteraction[] {
  return values.map(value => ({
    ...value,
    source: { ...value.source },
    action: {
      ...value.action,
      ...('target' in value.action && value.action.target ? { target: { ...value.action.target } } : {}),
      ...(value.action.type === 'emit-event' && value.action.metadata
        ? { metadata: structuredClone(value.action.metadata) }
        : {}),
    } as InteractionAction,
  }))
}

export function isSceneInteraction(value: unknown): value is SceneInteraction {
  return SceneInteractionSchema.safeParse(value).success
}
