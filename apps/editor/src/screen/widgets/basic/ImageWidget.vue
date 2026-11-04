<script setup lang="ts">
import { Image as ImageIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const emit = defineEmits<{ action: [click: { item?: string }] }>()
const p = computed(() => propsOf<{ src: string; fit: 'contain' | 'cover' | 'fill'; radius: number }>(props.widget))
</script>

<template>
  <img
    v-if="p.src"
    class="image"
    :src="p.src"
    alt=""
    draggable="false"
    :style="{ objectFit: p.fit, borderRadius: `${p.radius}px` }"
    @click="emit('action', {})"
  />
  <div v-else class="image image--empty"><ImageIcon :size="32" /><span>在右侧选择图片</span></div>
</template>

<style scoped>
.image {
  display: block;
  width: 100%;
  height: 100%;
}
.image--empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgb(148 163 184 / 0.4);
  color: rgb(148 163 184 / 0.7);
  font-size: 14px;
}
</style>
