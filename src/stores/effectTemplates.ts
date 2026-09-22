import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { cloneTemplate, type EffectTemplate } from '@/domain/effectTemplates'
import { LocalTemplateRepository } from '@/infrastructure/effectTemplates/TemplateRepository'

const repository = new LocalTemplateRepository()
export const useEffectTemplatesStore = defineStore('effectTemplates', () => {
  const templates = shallowRef<EffectTemplate[]>([])
  async function refresh(): Promise<void> { templates.value = await repository.list() }
  async function save(template: EffectTemplate): Promise<void> { await repository.save(template); await refresh() }
  async function remove(id: string): Promise<void> { await repository.remove(id); await refresh() }
  async function duplicate(template: EffectTemplate): Promise<void> {
    await save({ ...cloneTemplate(template), id: `template_${crypto.randomUUID()}`, origin: 'local', name: `${template.name.slice(0, 70)} 副本` })
  }
  return { templates, refresh, save, remove, duplicate }
})
