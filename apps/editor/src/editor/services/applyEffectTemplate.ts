import type { Object3D } from 'three'
import {
  bindingTargetFromObject,
  bindingTargetsInObjectTree,
  type EffectTemplate,
  instantiateTemplate,
  twinBindingTargetKey,
} from '@twin-studio/core'

/** Editor-specific existence check; all expansion semantics remain in the domain. */
export function prepareTemplateApplication(template: EffectTemplate, selected: Object3D, roots: readonly Object3D[]) {
  const target = bindingTargetFromObject(selected)
  if (!target) throw new Error('请选择有效场景对象')
  const targets = new Set(roots.flatMap(bindingTargetsInObjectTree).map(twinBindingTargetKey))
  return instantiateTemplate(template, target, candidate => targets.has(twinBindingTargetKey(candidate)))
}
