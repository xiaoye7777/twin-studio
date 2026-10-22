<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiSection from '@/components/ui/UiSection.vue'
import type { Widget } from '../model'
import { useScreenSession } from './session'

const props = defineProps<{ widget: Widget }>()
const session = useScreenSession()
const text = ref('')
const error = ref('')
const binding = computed(() => props.widget.data)
watch(
  () => [props.widget.id, binding.value?.json] as const,
  () => {
    text.value = binding.value?.json ?? ''
    error.value = ''
  },
  { immediate: true },
)

function apply(): void {
  try {
    if (text.value.trim()) JSON.parse(text.value)
    error.value = ''
  } catch {
    error.value = '不是有效的 JSON（纯文本也可以，会作为一个值显示）'
  }
  session.updateWidget(
    props.widget.id,
    w => void (w.data = { ...(w.data ?? { source: 'static' }), source: 'static', json: text.value }),
    '修改数据',
  )
}
</script>

<template>
  <UiSection title="静态数据">
    <div class="data">
      <textarea
        v-model="text"
        class="s-input data__json"
        rows="10"
        spellcheck="false"
        data-testid="static-json"
        @change="apply"
      />
      <p v-if="error" class="data__error">{{ error }}</p>
    </div>
  </UiSection>
</template>

<style scoped>
.data {
  padding: 0 12px;
}
.data__json {
  width: 100%;
  height: auto;
  padding: 8px;
  font-family: var(--s-mono);
  font-size: 11.5px;
  line-height: 1.5;
  resize: vertical;
}
.data__error {
  margin: 6px 0 0;
  color: var(--s-warn);
  font-size: 11.5px;
}
</style>
