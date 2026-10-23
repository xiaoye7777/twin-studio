<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Check, Plus, Sparkles, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import UiColor from '@/components/ui/UiColor.vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import { useProjectStore } from '@/stores/project'
import { builtinVariables, pagePresets, type ScreenDocument, type ScreenScaleMode, staggerEntrances } from '../model'
import { applyTheme, type ScreenTheme, themeOf, themes } from '../themes'
import FieldEditor from './FieldEditor.vue'
import { useScreenSession } from './session'

const session = useScreenSession()
const projects = useProjectStore()
const doc = computed(() => session.doc.value)
const page = computed(() => doc.value.page)
const preset = computed(
  () => pagePresets.find(item => item.width === page.value.width && item.height === page.value.height)?.id ?? 'custom',
)
const scaleModes: Array<{ value: ScreenScaleMode; label: string; hint: string }> = [
  { value: 'fit', label: '等比完整显示', hint: '整个页面可见，比例不同的屏幕留边' },
  { value: 'fill', label: '等比铺满', hint: '铺满屏幕，比例不同时裁掉边缘' },
  { value: 'width', label: '宽度铺满', hint: '左右铺满，高度方向可滚动' },
  { value: 'height', label: '高度铺满', hint: '上下铺满，宽度方向居中' },
  { value: 'stretch', label: '拉伸铺满', hint: '铺满屏幕，比例不同时拉伸变形' },
]

// ---------------------------------------------------------------- theme and entrances

const currentTheme = computed(() => (doc.value.page.theme ? themeOf(doc.value).id : ''))

function setTheme(theme: ScreenTheme): void {
  session.updatePage((_, d) => applyTheme(d, theme), `主题：${theme.name}`)
  ElMessage.success(`已切换为「${theme.name}」，可撤销`)
}

function stagger(): void {
  session.updatePage((_, d) => staggerEntrances(d.widgets), '一键入场动画')
  ElMessage.success('已为所有组件设置依次入场，预览中查看效果')
}

function clearEntrances(): void {
  session.updatePage((_, d) => {
    for (const widget of d.widgets) delete widget.enter
  }, '清除入场动画')
}

// ---------------------------------------------------------------- variables

const variables = computed(() => doc.value.variables ?? [])

function addVariable(): void {
  let index = variables.value.length + 1
  while (variables.value.some(item => item.name === `变量${index}`)) index++
  session.updatePage(
    (_, d) => void (d.variables = [...(d.variables ?? []), { name: `变量${index}`, value: '' }]),
    '添加变量',
  )
}

/** Every place a variable is referred to by name: interface parameters and click actions. */
function eachReference(d: ScreenDocument, visit: (holder: { variable?: string }) => void): void {
  for (const widget of d.widgets) {
    for (const param of Object.values(widget.data?.api?.params ?? {})) visit(param)
    for (const event of widget.events ?? []) if (event.action.type === 'set-variable') visit(event.action)
    if (typeof widget.props.variable === 'string') visit(widget.props as { variable?: string })
  }
}

function renameVariable(name: string, next: string): void {
  const trimmed = next.trim()
  if (!trimmed || trimmed === name || trimmed.startsWith('@') || variables.value.some(item => item.name === trimmed))
    return
  session.updatePage((_, d) => {
    const variable = d.variables?.find(item => item.name === name)
    if (variable) variable.name = trimmed
    eachReference(d, holder => {
      if (holder.variable === name) holder.variable = trimmed
    })
  }, '重命名变量')
}

function setVariableValue(name: string, value: string): void {
  session.updatePage((_, d) => {
    const variable = d.variables?.find(item => item.name === name)
    if (variable) variable.value = value
  }, '变量初始值')
}

function removeVariable(name: string): void {
  session.updatePage((_, d) => {
    d.variables = (d.variables ?? []).filter(item => item.name !== name)
    // Parameters that followed it keep working with their own value.
    for (const widget of d.widgets)
      for (const param of Object.values(widget.data?.api?.params ?? {}))
        if (param.variable === name) delete param.variable
  }, '删除变量')
}

const usage = (name: string) => {
  let count = 0
  eachReference(doc.value, holder => {
    if (holder.variable === name) count++
  })
  return count
}

function setPreset(id: string): void {
  const item = pagePresets.find(entry => entry.id === id)
  if (!item) return
  session.updatePage(p => {
    p.width = item.width
    p.height = item.height
  }, '画布尺寸')
  requestAnimationFrame(() => session.fit())
}
</script>

<template>
  <div data-testid="page-settings">
    <UiSection title="主题">
      <div class="themes">
        <button
          v-for="theme in themes"
          :key="theme.id"
          class="theme"
          :class="{ 'is-active': currentTheme === theme.id }"
          :title="`应用「${theme.name}」：统一修改背景和所有组件的颜色`"
          :data-testid="`theme-${theme.name}`"
          @click="setTheme(theme)"
        >
          <span class="theme__swatch" :style="{ background: theme.background }">
            <i v-for="color in theme.palette.slice(0, 4)" :key="color" :style="{ background: color }" />
          </span>
          <span class="theme__name"><Check v-if="currentTheme === theme.id" :size="11" />{{ theme.name }}</span>
        </button>
      </div>
    </UiSection>
    <UiSection title="画布">
      <UiRow label="尺寸">
        <select
          class="s-select"
          :value="preset"
          data-testid="page-preset"
          @change="setPreset(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="item in pagePresets" :key="item.id" :value="item.id">{{ item.label }}</option>
          <option value="custom" disabled>自定义</option>
        </select>
      </UiRow>
      <UiRow label="宽 × 高">
        <UiNumber
          label="W"
          :model-value="page.width"
          :min="320"
          :max="15360"
          :step="10"
          :precision="0"
          @update="session.updatePage(p => void (p.width = Math.round($event)), '画布尺寸', 'page-w')"
          @commit="session.commit()"
        />
        <UiNumber
          label="H"
          :model-value="page.height"
          :min="240"
          :max="8640"
          :step="10"
          :precision="0"
          @update="session.updatePage(p => void (p.height = Math.round($event)), '画布尺寸', 'page-h')"
          @commit="session.commit()"
        />
      </UiRow>
      <UiRow label="屏幕适配" :hint="scaleModes.find(mode => mode.value === page.scaleMode)?.hint">
        <select
          class="s-select"
          :value="page.scaleMode"
          @change="
            session.updatePage(p => void (p.scaleMode = ($event.target as HTMLSelectElement).value as ScreenScaleMode))
          "
        >
          <option v-for="mode in scaleModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
        </select>
      </UiRow>
      <p class="hint s-hint">
        按设计尺寸搭建，放映时按「屏幕适配」缩放到任意屏幕；大屏的比例与设计比例一致时效果最好。
      </p>
    </UiSection>
    <UiSection title="背景">
      <UiRow label="颜色">
        <UiColor
          :model-value="page.background.color"
          @update="session.updatePage(p => void (p.background.color = $event), '背景颜色', 'page-bg')"
          @commit="session.commit()"
        />
      </UiRow>
      <UiRow label="纹理">
        <select
          class="s-select"
          :value="page.background.style"
          @change="
            session.updatePage(
              p => void (p.background.style = ($event.target as HTMLSelectElement).value as typeof p.background.style),
            )
          "
        >
          <option value="plain">纯色</option>
          <option value="grid">科技网格</option>
          <option value="glow">光晕</option>
          <option value="stars">星点</option>
        </select>
      </UiRow>
      <UiRow label="背景图">
        <FieldEditor
          :field="{ key: 'image', label: '背景图', type: 'image' }"
          :value="page.background.image ?? ''"
          @update="session.updatePage(p => void (p.background.image = ($event as string) || null), '背景图')"
        />
      </UiRow>
    </UiSection>
    <UiSection title="入场动画" :open="false">
      <div class="actions">
        <button class="s-btn s-btn--sm" data-testid="stagger-entrances" @click="stagger">
          <Sparkles :size="12" />一键依次入场
        </button>
        <button class="s-btn s-btn--ghost s-btn--sm" @click="clearEntrances">全部清除</button>
      </div>
      <p class="hint s-hint">按从上到下、从左到右的顺序依次浮现；单个组件可在其「样式 → 入场动画」中调整。</p>
    </UiSection>
    <UiSection title="大屏变量" :count="variables.length">
      <template #actions>
        <button class="s-icon-btn" title="添加变量" data-testid="add-variable" @click="addVariable">
          <Plus :size="13" />
        </button>
      </template>
      <div
        v-for="variable in variables"
        :key="variable.name"
        class="variable"
        :data-testid="`variable-${variable.name}`"
      >
        <input
          class="s-input"
          :value="variable.name"
          title="变量名"
          @change="renameVariable(variable.name, ($event.target as HTMLInputElement).value)"
        />
        <input
          class="s-input"
          :value="variable.value"
          placeholder="初始值"
          title="大屏打开时的值"
          @change="setVariableValue(variable.name, ($event.target as HTMLInputElement).value)"
        />
        <span class="variable__usage" :title="`${usage(variable.name)} 处使用`">{{ usage(variable.name) }}</span>
        <button class="s-icon-btn" title="删除变量" @click="removeVariable(variable.name)">
          <Trash2 :size="13" />
        </button>
      </div>
      <p class="hint s-hint">
        变量把组件串起来：筛选器和点击动作改变变量，参数跟随变量的接口组件自动重新请求。另有内置变量：{{
          builtinVariables.map(item => item.label).join('、')
        }}。
      </p>
    </UiSection>
    <UiSection title="三维场景">
      <UiRow label="关联场景" hint="大屏读取该场景中设备的实时数据，三维视图组件显示该场景">
        <select
          class="s-select"
          :value="doc.sceneProjectId ?? ''"
          data-testid="page-scene"
          @change="
            session.updatePage(
              (_, d) => void (d.sceneProjectId = ($event.target as HTMLSelectElement).value || null),
              '关联场景',
            )
          "
        >
          <option value="">不关联</option>
          <option v-for="project in [...projects.projects].reverse()" :key="project.id" :value="project.id">
            {{ project.name }}
          </option>
        </select>
      </UiRow>
    </UiSection>
  </div>
</template>

<style scoped>
.hint {
  margin: 4px 0 0;
  padding: 0 12px;
}
.themes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 0 12px;
}
.theme {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
  color: var(--s-fg-2);
  font-size: 11px;
  cursor: pointer;
}
.theme:hover,
.theme.is-active {
  border-color: var(--s-accent-line);
  color: var(--s-fg);
}
.theme__swatch {
  display: flex;
  height: 22px;
  align-items: center;
  gap: 3px;
  padding: 0 5px;
  border-radius: 3px;
}
.theme__swatch i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.theme__name {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.actions {
  display: flex;
  gap: 6px;
  padding: 0 12px;
}
.variable {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 18px 26px;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 12px;
}
.variable__usage {
  color: var(--s-fg-3);
  font-size: 11px;
  text-align: center;
}
</style>
