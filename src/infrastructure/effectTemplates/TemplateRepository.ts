import { cloneTemplate, isEffectTemplate, type EffectTemplate } from '@/domain/effectTemplates'
import { getBuiltinTemplates } from '@/domain/effectTemplates/builtins'

export interface TemplateRepository {
  list(): Promise<EffectTemplate[]>
  get(id: string): Promise<EffectTemplate | null>
  save(template: EffectTemplate): Promise<void>
  remove(id: string): Promise<void>
}
const KEY = 'digital-twin-studio:effect-templates:v1'
/** Browser-local user resources, shared across projects, separate from scene history. */
export class LocalTemplateRepository implements TemplateRepository {
  private read(): EffectTemplate[] {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    let data: unknown
    try { data = JSON.parse(raw) } catch { throw new Error('本地模板数据损坏，未覆盖原数据') }
    if (!Array.isArray(data) || !data.every(t => isEffectTemplate(t) && t.origin === 'local' && !t.id.startsWith('builtin:')) || new Set(data.map(t => t.id)).size !== data.length) throw new Error('本地模板格式不正确，未覆盖原数据')
    return data
  }
  async list(): Promise<EffectTemplate[]> { return [...getBuiltinTemplates(), ...this.read()].map(cloneTemplate) }
  async get(id: string): Promise<EffectTemplate | null> { return (await this.list()).find(t => t.id === id) ?? null }
  async save(template: EffectTemplate): Promise<void> {
    if (!isEffectTemplate(template) || template.origin !== 'local' || template.id.startsWith('builtin:')) throw new Error('模板无效或内置模板不可修改')
    const templates = this.read().filter(t => t.id !== template.id)
    localStorage.setItem(KEY, JSON.stringify([...templates, cloneTemplate(template)]))
  }
  async remove(id: string): Promise<void> {
    if (id.startsWith('builtin:')) throw new Error('内置模板不可删除')
    localStorage.setItem(KEY, JSON.stringify(this.read().filter(t => t.id !== id)))
  }
}
