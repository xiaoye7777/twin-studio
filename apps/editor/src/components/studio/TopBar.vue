<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChevronLeft, Download, MonitorPlay, Redo2, Undo2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { PrimitiveShape, QualitySetting } from '@twin-studio/core'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { ProjectPackageService } from '@/infrastructure/packages/ProjectPackageService'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { useProjectStore } from '@/stores/project'
import { useSession } from '@/studio/context'
import { saveSelectionAsComponent } from '@/studio/saveComponent'
import { useShell } from '@/studio/shell'
import DropMenu, { type MenuItem } from './DropMenu.vue'

const session = useSession()
const shell = useShell()
const router = useRouter()
const projects = useProjectStore()
const project = computed(() => projects.getProjectById(session.projectId))
const ui = session.ui
const mac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = mac ? '⌘' : 'Ctrl+'

const saveLabel = computed(() => {
  if (ui.saveState === 'saving') return '保存中…'
  if (ui.saveState === 'error') return '保存失败'
  if (ui.saveState === 'unsaved') return '未保存'
  return ui.lastSaved ? `已保存 ${ui.lastSaved}` : '已保存'
})

async function exportPackage(): Promise<void> {
  if (!project.value) return
  if (!(await session.save())) {
    ElMessage.error(ui.saveError || '保存失败，无法导出')
    return
  }
  try {
    const service = new ProjectPackageService(new LocalSceneRepository(), new IndexedDbAssetRepository(), projects)
    const blob = await service.exportProject(project.value)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.value.name}.twin.zip`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    ElMessage.success('项目包已导出，可交给数据大屏使用')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败')
  }
}

async function openDashboardPreview(): Promise<void> {
  await session.save()
  window.open(router.resolve(`/projects/${session.projectId}/dashboard`).href, '_blank')
}

function addPrimitive(shape: PrimitiveShape): void {
  session.addPrimitive(shape)
}

const fileMenu = computed<MenuItem[]>(() => [
  { label: '保存', shortcut: `${mod}S`, action: () => void session.save(true) },
  { label: '历史版本…', action: () => (shell.dialog = 'history') },
  { label: '导出项目包 (.twin.zip)', action: () => void exportPackage() },
  { label: '在数据大屏中预览', action: () => void openDashboardPreview() },
  { divider: true },
  { label: '返回项目列表', action: () => void router.push('/projects') },
])

const editMenu = computed<MenuItem[]>(() => {
  const any = session.selection.value.length > 0
  return [
    { label: `撤销 ${ui.undoLabel}`.trim(), shortcut: `${mod}Z`, disabled: !ui.canUndo, action: () => session.undo() },
    { label: `重做 ${ui.redoLabel}`.trim(), shortcut: `${mod}⇧Z`, disabled: !ui.canRedo, action: () => session.redo() },
    { divider: true },
    { label: '复制', shortcut: `${mod}C`, disabled: !any, action: () => session.copySelection() },
    { label: '粘贴', shortcut: `${mod}V`, action: () => session.paste() },
    { label: '创建副本', shortcut: `${mod}D`, disabled: !any, action: () => session.duplicateSelection() },
    { label: '阵列复制…', disabled: !any, action: () => (shell.dialog = 'array') },
    { label: '删除', shortcut: 'Del', disabled: !any, action: () => session.deleteSelection() },
    { divider: true },
    { label: '组合', shortcut: `${mod}G`, disabled: !any, action: () => void session.groupSelection() },
    { label: '取消组合', shortcut: `${mod}⇧G`, disabled: !any, action: () => session.ungroupSelection() },
    { label: '放到地面', shortcut: 'End', disabled: !any, action: () => session.dropToGround() },
    { label: '全选', shortcut: `${mod}A`, action: () => session.selectAll() },
    { divider: true },
    { label: '保存为组件…', disabled: !any, action: () => void saveSelectionAsComponent(session) },
    {
      label: '替换模型…',
      disabled: !(session.selectedNodes.length === 1 && session.selectedNodes[0]!.kind === 'model'),
      action: () => (shell.dialog = 'replace-model'),
    },
  ]
})

const addMenu = computed<MenuItem[]>(() => [
  { label: '模型（资源库）', action: () => (shell.leftTab = 'assets') },
  { divider: true },
  { label: '立方体', action: () => addPrimitive('box') },
  { label: '平面', action: () => addPrimitive('plane') },
  { label: '圆柱', action: () => addPrimitive('cylinder') },
  { label: '球体', action: () => addPrimitive('sphere') },
  { label: '圆锥', action: () => addPrimitive('cone') },
  { divider: true },
  { label: '能流线（绘制）', action: () => session.startDrawing('path') },
  { label: '区域（绘制）', action: () => session.startDrawing('area') },
  { label: '文字标签', action: () => session.startDrawing('label') },
  { label: '灯光', action: () => session.startDrawing('light') },
  { label: '空分组', action: () => void session.addGroup() },
])

const qualityOptions: Array<[QualitySetting, string]> = [
  ['auto', '画质：自动'],
  ['low', '画质：流畅'],
  ['medium', '画质：均衡'],
  ['high', '画质：高清'],
]

const viewMenu = computed<MenuItem[]>(() => {
  const helpers = session.doc.value.settings.helpers
  return [
    {
      label: '网格',
      checked: helpers.grid,
      action: () => session.updateSettings(s => void (s.helpers.grid = !s.helpers.grid), '网格'),
    },
    {
      label: '坐标轴',
      checked: helpers.axes,
      action: () => session.updateSettings(s => void (s.helpers.axes = !s.helpers.axes), '坐标轴'),
    },
    { label: '底部面板（视角与导览）', checked: shell.dockOpen, action: () => (shell.dockOpen = !shell.dockOpen) },
    { divider: true },
    { label: '聚焦选中', shortcut: 'F', action: () => void session.focusSelection() },
    { label: '透视', shortcut: '0', action: () => void session.viewFrom('perspective') },
    { label: '顶视图', shortcut: '7', action: () => void session.viewFrom('top') },
    { label: '前视图', shortcut: '1', action: () => void session.viewFrom('front') },
    { label: '右视图', shortcut: '3', action: () => void session.viewFrom('right') },
    { label: '设当前视角为初始视角', action: () => session.setOpeningView() },
    { divider: true },
    ...qualityOptions.map(([value, label]) => ({
      label,
      checked: ui.stats.setting === value,
      action: () => session.setQuality(value),
    })),
    { divider: true },
    { label: '快捷键', shortcut: '?', action: () => (shell.dialog = 'shortcuts') },
  ]
})
</script>

<template>
  <header class="topbar">
    <div class="topbar__left">
      <button class="s-icon-btn" title="返回项目列表" @click="router.push('/projects')">
        <ChevronLeft :size="16" />
      </button>
      <div class="topbar__brand" aria-hidden="true">T</div>
      <div class="topbar__project">
        <span class="topbar__name">{{ project?.name ?? '未命名项目' }}</span>
        <span class="topbar__save" :class="`is-${ui.saveState}`" :title="ui.saveError" data-testid="save-state">{{
          saveLabel
        }}</span>
      </div>
      <nav v-if="ui.mode === 'edit'" class="topbar__menus">
        <DropMenu label="文件" :items="fileMenu" testid="menu-file" />
        <DropMenu label="编辑" :items="editMenu" testid="menu-edit" />
        <DropMenu label="添加" :items="addMenu" testid="menu-add" />
        <DropMenu label="视图" :items="viewMenu" testid="menu-view" />
      </nav>
    </div>

    <div class="topbar__mode" role="tablist" aria-label="模式">
      <button
        role="tab"
        :aria-selected="ui.mode === 'edit'"
        :class="{ 'is-active': ui.mode === 'edit' }"
        data-testid="mode-edit"
        @click="session.exitPreview()"
      >
        编辑
      </button>
      <button
        role="tab"
        :aria-selected="ui.mode === 'preview'"
        :class="{ 'is-active': ui.mode === 'preview' }"
        data-testid="mode-preview"
        @click="session.enterPreview()"
      >
        预览
      </button>
    </div>

    <div class="topbar__right">
      <template v-if="ui.mode === 'edit'">
        <button
          class="s-icon-btn"
          :disabled="!ui.canUndo"
          :title="`撤销 ${ui.undoLabel}（${mod}Z）`"
          @click="session.undo()"
        >
          <Undo2 :size="15" />
        </button>
        <button
          class="s-icon-btn"
          :disabled="!ui.canRedo"
          :title="`重做 ${ui.redoLabel}（${mod}⇧Z）`"
          @click="session.redo()"
        >
          <Redo2 :size="15" />
        </button>
        <span class="topbar__sep" />
      </template>
      <button
        class="s-btn s-btn--ghost"
        title="保存后在 Viewer SDK 中打开，即数据大屏中的效果"
        @click="openDashboardPreview"
      >
        <MonitorPlay :size="14" />大屏预览
      </button>
      <button class="s-btn s-btn--primary" data-testid="export-package" @click="exportPackage">
        <Download :size="14" />导出
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  border-bottom: 1px solid var(--s-line);
  background: var(--s-panel);
}
.topbar__left,
.topbar__right {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 6px;
}
.topbar__right {
  justify-content: flex-end;
}
.topbar__brand {
  display: grid;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 6px;
  background: linear-gradient(135deg, #f2a66c, #d9703a);
  color: #1b130c;
  font-size: 12px;
  font-weight: 800;
}
.topbar__project {
  display: flex;
  min-width: 0;
  flex-direction: column;
  margin: 0 6px 0 2px;
  line-height: 1.2;
}
.topbar__name {
  overflow: hidden;
  max-width: 220px;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar__save {
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.topbar__save.is-unsaved,
.topbar__save.is-saving {
  color: var(--s-warn);
}
.topbar__save.is-error {
  color: var(--s-danger);
}
.topbar__menus {
  display: flex;
  gap: 1px;
  padding-left: 6px;
  border-left: 1px solid var(--s-line);
}
.topbar__mode {
  display: flex;
  padding: 2px;
  border: 1px solid var(--s-line-2);
  border-radius: 6px;
  background: var(--s-field);
}
.topbar__mode button {
  width: 58px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--s-fg-3);
  font-size: 12px;
  cursor: pointer;
}
.topbar__mode button.is-active {
  background: var(--s-active);
  color: var(--s-fg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
}
.topbar__sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--s-line-2);
}
</style>
