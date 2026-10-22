<script setup lang="ts">
import UiSection from '@/components/ui/UiSection.vue'
import type { Widget } from '../model'

defineProps<{ widget: Widget }>()
</script>

<template>
  <UiSection title="交互">
    <p class="s-hint note">交互配置即将在这里提供。</p>
  </UiSection>
</template>

<style scoped>
.note {
  margin: 0;
  padding: 0 12px;
}
</style>
