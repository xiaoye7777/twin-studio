import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { cloneRules, isVisualRule, type VisualRule } from '@/domain/visualRules'
import type { RuleDiagnostic } from '@/runtime/effects/VisualRuleRuntime'
export const useVisualRulesStore = defineStore('visualRules', () => {
  const rules = shallowRef<VisualRule[]>([])
  const diagnostics = shallowRef<Record<string, RuleDiagnostic>>({})
  let commit: ((before: VisualRule[], after: VisualRule[], label: string) => void) | null = null
  function configure(action: typeof commit): void { commit = action }
  function replace(value: readonly VisualRule[]): void { rules.value = cloneRules(value) }
  function save(rule: VisualRule): void {
    if (!isVisualRule(rule)) throw new Error('规则配置无效')
    commit?.(cloneRules(rules.value), cloneRules([...rules.value.filter(r => r.id !== rule.id), rule]), 'Edit visual rule')
  }
  function remove(id: string): void { commit?.(cloneRules(rules.value), cloneRules(rules.value.filter(r => r.id !== id)), 'Delete visual rule') }
  function publish(value: Record<string, RuleDiagnostic>): void { diagnostics.value = value }
  return { rules, diagnostics, configure, replace, save, remove, publish }
})
