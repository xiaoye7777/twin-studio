<script setup lang="ts">
import { computed } from 'vue'
import UiColor from '@/components/ui/UiColor.vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import { useProjectStore } from '@/stores/project'
import { pagePresets, type ScreenScaleMode } from '../model'
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
</style>
