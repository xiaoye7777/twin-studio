import { ElMessage } from 'element-plus'
import {
  Box,
  Boxes,
  Circle,
  Cone,
  Cylinder,
  Lightbulb,
  RectangleHorizontal,
  Spline,
  SquareDashed,
  Tag,
} from 'lucide-vue-next'
import { type Component, computed, onMounted, reactive, ref, watch } from 'vue'
import type { PrimitiveShape } from '@twin-studio/core'
import { confirmAction } from '@/components/ui/confirm'
import {
  writeAssetDragPayload,
  writeBuiltinModelDragPayload,
  writeComponentDragPayload,
  writePrimitiveDragPayload,
} from '@/editor/assetDrag'
import { builtinModels, importBuiltinModel } from '@/editor/builtinModels'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import type { SceneComponentRecord } from '@/infrastructure/components/ComponentRepository'
import { useAssetStore } from '@/stores/assets'
import { useComponentStore } from '@/stores/components'
import { useSession } from './context'
import { modelThumbnail } from './modelThumbnails'
import { useShell } from './shell'

/** 资源库里的一张卡片。内置模型、我的模型、组件、基本体、绘制工具都统一成这个形状，界面只有一种卡片。 */
export interface LibraryItem {
  key: string
  /** 属于哪个标签（「全部」显示所有卡片）。 */
  tab: string
  name: string
  title: string
  testid: string
  icon: Component
  /** 缩略图的键；没有缩略图的卡片（基本体、工具）显示图标。 */
  thumb?: string
  /** 能拖进视口的卡片才有。 */
  drag?: (transfer: DataTransfer) => void
  activate: () => void
  remove?: () => void
}

const primitives: Array<{ shape: PrimitiveShape; label: string; icon: Component }> = [
  { shape: 'box', label: '立方体', icon: Box },
  { shape: 'plane', label: '平面', icon: RectangleHorizontal },
  { shape: 'cylinder', label: '圆柱', icon: Cylinder },
  { shape: 'sphere', label: '球体', icon: Circle },
  { shape: 'cone', label: '圆锥', icon: Cone },
]
const drawingTools = [
  { kind: 'path', label: '能流线', hint: '管线、电缆、能量流向', icon: Spline },
  { kind: 'area', label: '区域', hint: '功能分区、地块、围栏', icon: SquareDashed },
  { kind: 'label', label: '文字标签', hint: '楼宇名称、区域标题', icon: Tag },
  { kind: 'light', label: '灯光', hint: '夜景点光源、射灯', icon: Lightbulb },
] as const

function componentHint(item: SceneComponentRecord): string {
  const { nodes, bindings, visualRules } = item.data
  const parts = [`${nodes.length} 个对象`]
  if (bindings.length) parts.push(`${bindings.length} 个设备`)
  if (visualRules.length) parts.push(`${visualRules.length} 条告警规则`)
  return `${item.name} · ${parts.join(' · ')} — 拖入视口或单击放置`
}

function sizeLabel(bytes: number): string {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * 底栏资源库的数据：把各种来源的资源合并成一个卡片列表，再按标签和搜索词筛选。
 * 缩略图只为当前看得见的卡片生成（首次渲染后缓存在本机）。
 */
export function useAssetLibrary() {
  const session = useSession()
  const shell = useShell()
  const assetStore = useAssetStore()
  const componentStore = useComponentStore()
  const repository = new IndexedDbAssetRepository()
  const filter = ref('')
  const uploading = ref(false)
  const thumbs = reactive<Record<string, string>>({})

  async function run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action()
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '模型加载失败')
    }
  }

  async function removeComponent(item: SceneComponentRecord): Promise<void> {
    const confirmed = await confirmAction(`从组件库删除「${item.name}」？已放置到场景中的不受影响。`, {
      title: '删除组件',
      confirm: '删除',
    })
    if (confirmed) await componentStore.remove(item.id)
  }

  const builtinFiles = new Set(builtinModels.map(model => model.file))
  const items = computed<LibraryItem[]>(() => [
    ...builtinModels.map(model => ({
      key: `builtin:${model.key}`,
      tab: model.category,
      name: model.name,
      title: `${model.description} — 拖入视口或单击放置`,
      testid: `builtin-${model.key}`,
      icon: Box,
      thumb: `builtin:${model.file}`,
      drag: (transfer: DataTransfer) => writeBuiltinModelDragPayload(transfer, model.key),
      activate: () =>
        void run(async () => {
          const record = await importBuiltinModel(model, repository)
          void assetStore.refresh()
          await session.create.addModel(record.id)
        }),
    })),
    ...assetStore.assets
      .filter(asset => asset.assetType === 'model' && !builtinFiles.has(asset.name))
      .map(asset => ({
        key: `asset:${asset.id}`,
        tab: 'mine',
        name: asset.name.replace(/\.glb$/i, ''),
        title: `${asset.name} · ${sizeLabel(asset.size)}`,
        testid: `asset-${asset.name}`,
        icon: Box,
        thumb: `asset:${asset.id}`,
        drag: (transfer: DataTransfer) => writeAssetDragPayload(transfer, asset.id),
        activate: () => void run(() => session.create.addModel(asset.id)),
      })),
    ...componentStore.components.map(item => ({
      key: `component:${item.id}`,
      tab: 'components',
      name: item.name,
      title: componentHint(item),
      testid: `component-${item.name}`,
      icon: Boxes,
      thumb: item.thumbnail ? `component:${item.id}` : undefined,
      drag: (transfer: DataTransfer) => writeComponentDragPayload(transfer, item.id),
      activate: () => session.create.addComponent(item.data),
      remove: () => void removeComponent(item),
    })),
    ...primitives.map(item => ({
      key: `primitive:${item.shape}`,
      tab: 'primitives',
      name: item.label,
      title: `${item.label} — 拖入视口或单击放置`,
      testid: `primitive-${item.shape}`,
      icon: item.icon,
      drag: (transfer: DataTransfer) => writePrimitiveDragPayload(transfer, item.shape),
      activate: () => void session.create.addPrimitive(item.shape),
    })),
    ...drawingTools.map(item => ({
      key: `tool:${item.kind}`,
      tab: 'drawing',
      name: item.label,
      title: `${item.label}：${item.hint}`,
      testid: `library-draw-${item.kind}`,
      icon: item.icon,
      activate: () => session.tools.startDrawing(item.kind),
    })),
  ])

  const searched = computed(() => items.value.filter(item => !filter.value || item.name.includes(filter.value)))
  const count = (tab: string) => searched.value.filter(item => item.tab === tab).length
  const tabs = computed(() => [
    { id: 'all', label: '全部', count: searched.value.length },
    ...[...new Set(builtinModels.map(model => model.category))].map(category => ({
      id: category as string,
      label: category as string,
      count: count(category),
    })),
    { id: 'mine', label: '我的模型', count: count('mine') },
    { id: 'components', label: '我的组件', count: count('components') },
    { id: 'primitives', label: '基本体', count: count('primitives') },
    { id: 'drawing', label: '绘制与标注', count: count('drawing') },
  ])
  const visible = computed(() =>
    shell.assetTab === 'all' ? searched.value : searched.value.filter(item => item.tab === shell.assetTab),
  )

  // ---------------------------------------------------------------- 缩略图

  const requested = new Set<string>()
  async function loadThumb(item: LibraryItem): Promise<void> {
    const key = item.thumb
    if (!key || requested.has(key)) return
    requested.add(key)
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
    if (kind === 'builtin') {
      const image = await modelThumbnail(key, `${import.meta.env.BASE_URL}demo-assets/${id}`)
      if (image) thumbs[key] = image
    } else if (kind === 'asset') {
      const record = await repository.get(id)
      if (!record) return
      const url = URL.createObjectURL(record.blob)
      const image = await modelThumbnail(`asset:${record.fingerprint}`, url)
      URL.revokeObjectURL(url)
      if (image) thumbs[key] = image
    } else {
      const component = componentStore.components.find(entry => entry.id === id)
      if (component?.thumbnail) thumbs[key] = component.thumbnail
    }
  }
  watch(
    [visible, () => shell.dockOpen],
    () => {
      if (shell.dockOpen) for (const item of visible.value) void loadThumb(item)
    },
    { immediate: true },
  )

  onMounted(() => {
    void componentStore.refresh()
    void assetStore.refresh()
  })

  // ---------------------------------------------------------------- 导入

  async function upload(files: File[]): Promise<void> {
    uploading.value = true
    try {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.glb')) {
          ElMessage.warning(`${file.name}：目前支持 .glb 模型（支持 Meshopt / Draco / KTX2 压缩）`)
          continue
        }
        const { asset, isNew } = await assetStore.importAsset(file, 'model')
        ElMessage.success(isNew ? `已导入 ${asset.name}` : `${asset.name} 已在资源库中`)
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '导入失败')
    } finally {
      uploading.value = false
    }
  }

  return { filter, tabs, visible, thumbs, uploading, upload }
}
