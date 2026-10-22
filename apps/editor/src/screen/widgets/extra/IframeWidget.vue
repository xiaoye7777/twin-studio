<script setup lang="ts">
import { Globe } from 'lucide-vue-next'
import { computed } from 'vue'
import { propsOf } from '../registry'
import type { WidgetComponentProps } from '../types'

const props = defineProps<WidgetComponentProps>()
const p = computed(() => propsOf<{ url: string }>(props.widget))
const safe = computed(() => /^https?:\/\//i.test(p.value.url))
</script>

<template>
  <iframe
    v-if="safe"
    class="frame"
    :src="p.url"
    sandbox="allow-scripts allow-same-origin allow-popups"
    referrerpolicy="no-referrer"
  />
  <div v-else class="frame frame--empty"><Globe :size="30" /><span>在右侧填写以 http(s):// 开头的网址</span></div>
</template>

<style scoped>
.frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.frame--empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgb(148 163 184 / 0.4);
  background: transparent;
  color: rgb(148 163 184 / 0.7);
  font-size: 14px;
}
</style>
