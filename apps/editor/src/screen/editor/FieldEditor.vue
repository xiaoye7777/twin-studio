<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Plus, X } from 'lucide-vue-next'
import UiColor from '@/components/ui/UiColor.vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { screenPalette } from '../widgets/format'
import type { FieldDef } from '../widgets/types'

const props = defineProps<{ field: FieldDef; value: unknown }>()
/** `live` updates merge into one undo step until `commit`. */
const emit = defineEmits<{ update: [value: unknown, live?: boolean]; commit: [] }>()

const palettes: string[][] = [
  screenPalette,
  ['#22d3ee', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#f43f5e'],
  ['#4ade80', '#a3e635', '#facc15', '#fb923c', '#f87171', '#94a3b8'],
  ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59'],
]

function pickImage(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  if (file.size > 4 * 1024 * 1024) return void ElMessage.warning('图片超过 4 MB，请先压缩')
  const reader = new FileReader()
  reader.onload = () => emit('update', String(reader.result))
  reader.readAsDataURL(file)
}

function setColor(index: number, color: string): void {
  const list = [...((props.value as string[]) ?? [])]
  list[index] = color
  emit('update', list, true)
}
</script>

<template>
  <input
    v-if="field.type === 'text'"
    class="s-input"
    :value="value as string"
    @input="emit('update', ($event.target as HTMLInputElement).value, true)"
    @change="emit('commit')"
  />
  <textarea
    v-else-if="field.type === 'textarea'"
    class="s-input field__textarea"
    rows="4"
    :value="value as string"
    @input="emit('update', ($event.target as HTMLTextAreaElement).value, true)"
    @change="emit('commit')"
  />
  <UiNumber
    v-else-if="field.type === 'number'"
    :model-value="Number(value ?? 0)"
    :min="field.min"
    :max="field.max"
    :step="field.step ?? 1"
    :unit="field.unit"
    :precision="(field.step ?? 1) < 1 ? 2 : 0"
    @update="emit('update', $event, true)"
    @commit="emit('commit')"
  />
  <UiSlider
    v-else-if="field.type === 'slider'"
    :model-value="Number(value ?? 0)"
    :min="field.min ?? 0"
    :max="field.max ?? 1"
    :step="field.step ?? 0.01"
    :unit="field.unit"
    @update="emit('update', $event, true)"
    @commit="emit('commit')"
  />
  <UiColor
    v-else-if="field.type === 'color'"
    :model-value="String(value ?? '#ffffff')"
    @update="emit('update', $event, true)"
    @commit="emit('commit')"
  />
  <select
    v-else-if="field.type === 'select'"
    class="s-select"
    :value="value as string"
    @change="
      emit(
        'update',
        typeof field.options?.[0]?.value === 'number'
          ? Number(($event.target as HTMLSelectElement).value)
          : ($event.target as HTMLSelectElement).value,
      )
    "
  >
    <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
  </select>
  <UiSwitch
    v-else-if="field.type === 'switch'"
    :model-value="Boolean(value)"
    @update:model-value="emit('update', $event)"
  />
  <div v-else-if="field.type === 'image'" class="field__image">
    <img v-if="value" :src="value as string" alt="" />
    <label class="s-btn s-btn--sm"> 选择图片<input type="file" accept="image/*" hidden @change="pickImage" /> </label>
    <button v-if="value" class="s-btn s-btn--sm" @click="emit('update', '')">清除</button>
  </div>
  <div v-else-if="field.type === 'palette'" class="field__palette">
    <div class="field__colors">
      <span v-for="(color, index) in (value as string[]) ?? []" :key="index" class="field__color">
        <UiColor :model-value="color" @update="setColor(index, $event)" @commit="emit('commit')" />
        <button
          class="field__remove"
          title="移除"
          @click="
            emit(
              'update',
              ((value as string[]) ?? []).filter((_, at) => at !== index),
            )
          "
        >
          <X :size="10" />
        </button>
      </span>
      <button class="s-icon-btn" title="添加颜色" @click="emit('update', [...((value as string[]) ?? []), '#38bdf8'])">
        <Plus :size="13" />
      </button>
    </div>
    <div class="field__presets">
      <button
        v-for="(palette, index) in palettes"
        :key="index"
        class="field__preset"
        title="使用这组配色"
        @click="emit('update', [...palette])"
      >
        <i v-for="color in palette" :key="color" :style="{ background: color }" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.field__textarea {
  height: auto;
  min-height: 72px;
  padding: 6px 8px;
  resize: vertical;
  line-height: 1.5;
}
.field__image {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.field__image img {
  width: 100%;
  max-height: 90px;
  border-radius: 4px;
  object-fit: contain;
  background: #0b0d10;
}
.field__palette {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.field__colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.field__color {
  position: relative;
  width: 76px;
}
.field__remove {
  position: absolute;
  top: -5px;
  right: -5px;
  display: none;
  width: 14px;
  height: 14px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--s-danger);
  color: #fff;
  cursor: pointer;
}
.field__color:hover .field__remove {
  display: grid;
}
.field__presets {
  display: flex;
  gap: 6px;
}
.field__preset {
  display: flex;
  overflow: hidden;
  height: 14px;
  flex: 1;
  padding: 0;
  border: 1px solid var(--s-line);
  border-radius: 3px;
  cursor: pointer;
}
.field__preset i {
  flex: 1;
}
</style>
