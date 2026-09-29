<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'

defineProps<{ title: string; meta?: string | number }>()
const open = ref(true)
</script>

<template>
  <section class="border-b border-line">
    <header class="flex h-8 items-center gap-1 pl-2 pr-2.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        :aria-expanded="open"
        @click="open = !open"
      >
        <el-icon class="chevron shrink-0 text-fg-3" :class="{ 'is-open': open }"><ArrowRight /></el-icon>
        <span class="truncate text-[12px] font-semibold text-fg">{{ title }}</span>
        <span v-if="meta !== undefined && meta !== ''" class="shrink-0 text-[11px] text-fg-3">{{ meta }}</span>
      </button>
      <div class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
      </div>
    </header>
    <!-- v-show keeps collapsed content mounted, so section state and test hooks stay intact. -->
    <div v-show="open" class="space-y-2.5 px-3 pb-3.5 pt-0.5">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.chevron {
  font-size: 10px;
  transition: transform 140ms ease;
}

.chevron.is-open {
  transform: rotate(90deg);
}
</style>
