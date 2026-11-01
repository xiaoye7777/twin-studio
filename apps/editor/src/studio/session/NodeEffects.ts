import {
  createEffect,
  createInteraction,
  type EffectInstance,
  type EffectKind,
  getBuiltinTemplates,
  newId,
  plain,
  type SceneInteraction,
  targetNodeId,
  type TwinBindingTarget,
  type VisualRule,
} from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

/**
 * 挂在对象上的三样东西：特效（发光、标牌…）、告警规则（变量满足条件时套用特效模板）、点击交互。
 * 选中模型部件时，只列出和编辑挂在这个部件上的。
 */
export class NodeEffects {
  constructor(private readonly session: EditorSession) {}

  /** Whether a target is what the inspector edits for a node (a selected part: exactly that part). */
  private targets(nodeId: string): (target: TwinBindingTarget) => boolean {
    const part = this.session.part.value
    if (part?.nodeId !== nodeId) return target => targetNodeId(target) === nodeId
    return target =>
      target.type === 'asset-node' && target.instanceId === nodeId && target.assetNodeId === part.assetNodeId
  }

  effectsFor(nodeId: string): EffectInstance[] {
    const matches = this.targets(nodeId)
    return this.session.doc.value.effects.filter(effect => matches(effect.target))
  }

  addEffect(nodeId: string, kind: EffectKind): void {
    const node = this.session.node(nodeId)
    const target = this.session.devices.targetOf(nodeId)
    if (!node || !target) return
    const effect = createEffect(kind, target)
    const part = this.session.part.value
    if (kind === 'floating-label' || kind === 'icon-marker')
      effect.parameters.text =
        part?.nodeId === nodeId ? this.session.modelParts.partName(nodeId, part.assetNodeId) : node.name
    this.session.edit('添加特效', draft => void draft.effects.push(effect))
  }

  updateEffect(id: string, recipe: (effect: EffectInstance) => void, coalesceKey?: string): void {
    this.session.edit(
      '修改特效',
      draft => {
        const effect = draft.effects.find(item => item.id === id)
        if (effect) recipe(effect)
      },
      { coalesceKey },
    )
  }

  removeEffect(id: string): void {
    this.session.edit('删除特效', draft => void (draft.effects = draft.effects.filter(item => item.id !== id)))
  }

  rulesFor(nodeId: string): VisualRule[] {
    const matches = this.targets(nodeId)
    return this.session.doc.value.visualRules.filter(rule => matches(rule.target))
  }

  addRule(nodeId: string): boolean {
    const binding = this.session.devices.bindingFor(nodeId)
    if (!binding) return false
    const variable = binding.variables.find(item => item.dataType === 'number') ?? binding.variables[0]
    if (!variable) return false
    const templates = getBuiltinTemplates()
    const template = plain(templates.find(item => item.name.includes('告警')) ?? templates[0] ?? null)
    const condition: VisualRule['condition'] =
      variable.dataType === 'number'
        ? { dataType: 'number', operator: '>', value: 60 }
        : variable.dataType === 'boolean'
          ? { dataType: 'boolean', operator: '==', value: true }
          : { dataType: 'string', operator: '==', value: 'alarm' }
    const rule: VisualRule = {
      id: newId('rule'),
      bindingId: binding.id,
      target: binding.target,
      variableKey: variable.key,
      condition,
      enabled: true,
      priority: 10,
      template,
    }
    this.session.edit('添加告警规则', draft => void draft.visualRules.push(rule))
    return true
  }

  updateRule(id: string, recipe: (rule: VisualRule) => void): void {
    this.session.edit('修改告警规则', draft => {
      const rule = draft.visualRules.find(item => item.id === id)
      if (rule) recipe(rule)
    })
  }

  removeRule(id: string): void {
    this.session.edit(
      '删除告警规则',
      draft => void (draft.visualRules = draft.visualRules.filter(item => item.id !== id)),
    )
  }

  interactionsFor(nodeId: string): SceneInteraction[] {
    const matches = this.targets(nodeId)
    return this.session.doc.value.interactions.filter(item => matches(item.source))
  }

  addInteraction(nodeId: string): void {
    const target = this.session.devices.targetOf(nodeId)
    if (!target) return
    const interaction = createInteraction(target)
    interaction.action = { type: 'emit-event', eventName: 'device-click' }
    this.session.edit('添加交互', draft => void draft.interactions.push(interaction))
  }

  updateInteraction(id: string, recipe: (item: SceneInteraction) => void): void {
    this.session.edit('修改交互', draft => {
      const item = draft.interactions.find(entry => entry.id === id)
      if (item) recipe(item)
    })
  }

  removeInteraction(id: string): void {
    this.session.edit(
      '删除交互',
      draft => void (draft.interactions = draft.interactions.filter(item => item.id !== id)),
    )
  }
}
