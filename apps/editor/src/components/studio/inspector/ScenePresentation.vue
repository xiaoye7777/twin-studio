<script setup lang="ts">
import { Camera, Check } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { createDefaultCameraLimits, type CameraLimits } from '@twin-studio/core'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useSession } from '@/studio/context'

const session = useSession()
const doc = computed(() => session.doc.value)
const presentation = computed(() => doc.value.presentation)
const justSet = ref(false)

const limits = computed(() => presentation.value.cameraLimits)
function setLimits(patch: Partial<CameraLimits>, key?: string): void {
  session.updatePresentation(
    p => void (p.cameraLimits = { ...(p.cameraLimits ?? createDefaultCameraLimits()), ...patch }),
    key && `camera-limits:${key}`,
  )
}

function setOpeningView(): void {
  session.setOpeningView()
  justSet.value = true
  setTimeout(() => (justSet.value = false), 1600)
}
</script>

<template>
  <div data-testid="scene-presentation">
    <UiSection title="初始视角">
      <p class="pres__note s-hint">
        大屏打开项目时的镜头。画面会按屏幕比例自动适配：窄屏自动拉远以保留构图宽度，超宽屏展示更多两侧内容。
      </p>
      <div class="pres__actions">
        <button class="s-btn" data-testid="set-opening-view" @click="setOpeningView">
          <Check v-if="justSet" :size="13" /><Camera v-else :size="13" />{{
            justSet ? '已设置' : '设当前视角为初始视角'
          }}
        </button>
        <button v-if="doc.cameraView" class="s-btn s-btn--ghost" @click="session.engine.flyTo(doc.cameraView!)">
          查看
        </button>
      </div>
    </UiSection>

    <UiSection title="无人值守放映">
      <UiRow label="自动导览" hint="大屏空闲一段时间后自动循环播放">
        <select
          class="s-select"
          :value="presentation.autoplayTourId ?? ''"
          data-testid="autoplay-tour"
          @change="
            session.updatePresentation(
              p => void (p.autoplayTourId = ($event.target as HTMLSelectElement).value || null),
            )
          "
        >
          <option value="">不自动播放</option>
          <option v-for="tour in doc.tours" :key="tour.id" :value="tour.id">{{ tour.name }}</option>
        </select>
      </UiRow>
      <UiRow label="空闲时间" hint="无人操作多少秒后开始；0 表示关闭">
        <UiNumber
          :model-value="presentation.idleSeconds"
          :min="0"
          :max="3600"
          :step="5"
          :precision="0"
          unit="秒"
          @update="session.updatePresentation(p => void (p.idleSeconds = $event))"
          @commit="session.commit()"
        />
      </UiRow>
      <UiRow label="空闲环绕" hint="没有自动导览时，空闲后镜头缓慢环绕">
        <UiSwitch
          :model-value="presentation.autoRotate"
          @update:model-value="session.updatePresentation(p => void (p.autoRotate = $event))"
        />
      </UiRow>
      <p class="pres__note s-hint">
        适用于展厅、影院等宣讲场所：任何点击或滚轮操作都会立即把控制权交还给讲解人，停止后重新计时。
      </p>
    </UiSection>

    <UiSection title="镜头范围">
      <UiRow label="限制镜头" hint="观众拖动、缩放时不会把场景拖丢、拉得太远或钻到地面以下">
        <UiSwitch
          :model-value="limits?.enabled ?? false"
          data-testid="camera-limits"
          @update:model-value="setLimits({ enabled: $event })"
        />
      </UiRow>
      <template v-if="limits?.enabled">
        <UiRow label="最远距离" hint="场景尺寸的倍数；保存的视角始终可达">
          <UiSlider
            :model-value="limits.maxDistance"
            :min="0.3"
            :max="4"
            :step="0.1"
            :precision="1"
            unit="×"
            @update="setLimits({ maxDistance: $event }, 'max')"
            @commit="session.commit()"
          />
        </UiRow>
        <UiRow label="最近距离">
          <UiNumber
            :model-value="limits.minDistance"
            :min="0.1"
            :max="500"
            :step="0.5"
            unit="m"
            @update="setLimits({ minDistance: $event }, 'min')"
            @commit="session.commit()"
          />
        </UiRow>
        <UiRow label="最低俯角" hint="镜头离地面的最小角度">
          <UiSlider
            :model-value="limits.minElevation"
            :min="0"
            :max="60"
            :step="1"
            :precision="0"
            unit="°"
            @update="setLimits({ minElevation: $event }, 'elevation')"
            @commit="session.commit()"
          />
        </UiRow>
      </template>
      <p class="pres__note s-hint">在预览和大屏中生效，编辑时镜头不受限制。</p>
    </UiSection>

    <UiSection title="大屏联动（SDK）" :open="false">
      <p class="pres__note s-hint">
        数据大屏通过 Viewer SDK 控制场景：<code class="s-mono">playTour()</code>、<code class="s-mono"
          >flyToBookmark()</code
        >、 <code class="s-mono">setNodeVisible()</code>（分组可作图层）、<code class="s-mono">focusDevice()</code
        >；并接收 <code class="s-mono">selection-change</code>、<code class="s-mono">interaction-event</code>、<code
          class="s-mono"
          >alarm-change</code
        >、 <code class="s-mono">tour-change</code> 事件。
      </p>
    </UiSection>
  </div>
</template>

<style scoped>
.pres__note {
  margin: 0;
  padding: 2px 12px 6px;
}
.pres__note code {
  color: var(--s-fg-2);
}
.pres__actions {
  display: flex;
  gap: 6px;
  padding: 4px 12px 0;
}
</style>
