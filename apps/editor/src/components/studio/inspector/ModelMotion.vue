<script setup lang="ts">
import { Plus, RotateCw, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { type ModelNodeV2, newId, type PartMotion } from '@twin-studio/core'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useSession } from '@/studio/context'

const props = defineProps<{ node: ModelNodeV2 }>()
const session = useSession()
// Clip and part lists exist once the model has loaded; syncRevision ticks when it has.
const clips = computed(() => {
  void session.ui.syncRevision
  return session.sync.clipsOf(props.node.id)
})
const parts = computed(() => {
  void session.ui.syncRevision
  return session.sync.partsOf(props.node.id)
})
const numericVariables = computed(() => {
  void session.doc.value
  return (session.bindingFor(props.node.id)?.variables ?? []).filter(variable => variable.dataType === 'number')
})
const animation = computed(() => props.node.model.animation)
const motions = computed(() => props.node.model.motions ?? [])
const clipValue = computed(() => (animation.value === undefined ? '__default' : (animation.value.clip ?? '__none')))

function update(recipe: (model: ModelNodeV2['model']) => void, key?: string): void {
  session.updateNode(
    props.node.id,
    node => node.kind === 'model' && recipe(node.model),
    '动画设置',
    key && `${props.node.id}:${key}`,
  )
}

function setClip(value: string): void {
  update(model => {
    if (value === '__default') delete model.animation
    else
      model.animation = {
        clip: value === '__none' ? null : value,
        speed: model.animation?.speed ?? 1,
        loop: model.animation?.loop ?? true,
      }
  })
}

function setAnimation(patch: Partial<NonNullable<ModelNodeV2['model']['animation']>>, key?: string): void {
  update(model => {
    model.animation = {
      clip: model.animation?.clip ?? clips.value[0] ?? null,
      speed: 1,
      loop: true,
      ...model.animation,
      ...patch,
    }
  }, key)
}

function addMotion(): void {
  // A part named like blades / fan / rotor is the likely candidate.
  const guess = parts.value.find(part => /blade|fan|rotor|叶/i.test(part.name)) ?? parts.value[0]
  if (!guess) return
  const variable = numericVariables.value.find(item => /rotor|rpm|speed|转速/i.test(item.key + item.name))
  const motion: PartMotion = {
    id: newId('motion'),
    assetNodeId: guess.id,
    axis: 'z',
    speed: 60,
    speedVariable: variable?.key ?? null,
    factor: variable ? 6 : 1,
  }
  update(model => void (model.motions = [...(model.motions ?? []), motion]))
}

function setMotion(id: string, patch: Partial<PartMotion>, key?: string): void {
  update(
    model => {
      const motion = model.motions?.find(item => item.id === id)
      if (motion) Object.assign(motion, patch)
    },
    key && `${id}:${key}`,
  )
}

function removeMotion(id: string): void {
  update(model => {
    model.motions = (model.motions ?? []).filter(item => item.id !== id)
    if (!model.motions.length) delete model.motions
  })
}
</script>

<template>
  <UiSection title="动画" data-testid="model-animation">
    <template v-if="clips.length">
      <UiRow label="动画片段">
        <select
          class="s-select"
          :value="clipValue"
          data-testid="animation-clip"
          @change="setClip(($event.target as HTMLSelectElement).value)"
        >
          <option value="__default">自动（{{ clips[0] }}）</option>
          <option value="__none">不播放</option>
          <option v-for="clip in clips" :key="clip" :value="clip">{{ clip }}</option>
        </select>
      </UiRow>
      <UiRow label="播放速度">
        <UiSlider
          :model-value="animation?.speed ?? 1"
          :min="0"
          :max="3"
          :step="0.05"
          @update="setAnimation({ speed: $event }, 'speed')"
          @commit="session.commit()"
        />
      </UiRow>
      <UiRow label="循环">
        <UiSwitch :model-value="animation?.loop ?? true" @update:model-value="setAnimation({ loop: $event })" />
      </UiRow>
    </template>
    <p v-else class="motion__note s-hint">模型文件不含动画片段。可以添加部件运动，例如让风机叶片旋转。</p>

    <div class="motion__head">
      <span>部件运动</span>
      <button class="s-btn s-btn--sm" :disabled="!parts.length" data-testid="add-motion" @click="addMotion">
        <Plus :size="12" />添加
      </button>
    </div>
    <div v-for="motion in motions" :key="motion.id" class="motion">
      <div class="motion__line">
        <RotateCw :size="13" class="motion__icon" />
        <select
          class="s-select"
          :value="motion.assetNodeId"
          title="运动的部件"
          @change="setMotion(motion.id, { assetNodeId: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="part in parts" :key="part.id" :value="part.id">{{ part.name }}</option>
        </select>
        <UiSegmented
          class="motion__axis"
          :model-value="motion.axis"
          :options="[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ]"
          @update:model-value="setMotion(motion.id, { axis: $event })"
        />
        <button class="s-icon-btn" title="删除" @click="removeMotion(motion.id)"><Trash2 :size="12" /></button>
      </div>
      <div class="motion__line">
        <span class="motion__label">转速来自</span>
        <select
          class="s-select"
          :value="motion.speedVariable ?? ''"
          @change="setMotion(motion.id, { speedVariable: ($event.target as HTMLSelectElement).value || null })"
        >
          <option value="">固定速度</option>
          <option v-for="variable in numericVariables" :key="variable.key" :value="variable.key">
            实时数据：{{ variable.name || variable.key }}
          </option>
        </select>
      </div>
      <div class="motion__line">
        <template v-if="motion.speedVariable">
          <span class="motion__label">倍率</span>
          <UiNumber
            :model-value="motion.factor"
            :step="0.5"
            title="度/秒 = 实时值 × 倍率（转/分 × 6 = 度/秒）"
            @update="setMotion(motion.id, { factor: $event }, 'factor')"
            @commit="session.commit()"
          />
        </template>
        <span class="motion__label">{{ motion.speedVariable ? '无数据时' : '速度' }}</span>
        <UiNumber
          :model-value="motion.speed"
          :step="5"
          :precision="0"
          unit="°/s"
          @update="setMotion(motion.id, { speed: $event }, 'speed')"
          @commit="session.commit()"
        />
      </div>
    </div>
    <p v-if="motions.length && !numericVariables.length" class="motion__note s-hint">
      绑定设备后，转速可以跟随实时数据（如风机转速）。
    </p>
  </UiSection>
</template>

<style scoped>
.motion__note {
  margin: 0;
  padding: 0 12px 6px;
}
.motion__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px 4px;
  color: var(--s-fg-2);
  font-size: 11.5px;
}
.motion {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0 8px 6px;
  padding: 7px 8px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
}
.motion__line {
  display: flex;
  align-items: center;
  gap: 5px;
}
.motion__line .s-select {
  min-width: 0;
  flex: 1;
}
.motion__icon {
  flex-shrink: 0;
  color: var(--s-accent-2);
}
.motion__axis {
  max-width: 96px;
  flex: none;
}
.motion__label {
  flex-shrink: 0;
  color: var(--s-fg-3);
  font-size: 11px;
}
</style>
