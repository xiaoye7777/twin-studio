import { ElMessage, ElMessageBox } from 'element-plus'
import { useComponentStore } from '@/stores/components'
import type { EditorSession } from './EditorSession'

/** Saves the selection to the component library, asking for a name. */
export async function saveSelectionAsComponent(session: EditorSession): Promise<void> {
  const component = await session.componentFromSelection()
  if (!component) return
  let name: string
  try {
    const result = await ElMessageBox.prompt(
      '保存到「资源 → 我的组件」，在任何项目中拖入即可复用。设备绑定、告警规则、特效和交互一并保存，每次放置时设备编号自动递增。',
      '保存为组件',
      {
        inputValue: component.name,
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        customClass: 'studio-dialog',
        inputValidator: value => value.trim().length > 0 || '请输入组件名称',
      },
    )
    name = result.value.trim()
  } catch {
    return
  }
  await useComponentStore().add(name, component.data, component.thumbnail)
  ElMessage.success(`已保存组件「${name}」`)
}
