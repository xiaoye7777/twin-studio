<script setup lang="ts">
import { computed } from 'vue'
import type { ScreenDocument } from '../model'
import WidgetHost from './WidgetHost.vue'

const props = defineProps<{ screen: ScreenDocument; editing: boolean }>()
const page = computed(() => props.screen.page)
const backgroundStyle = computed(() => {
  const { color, image } = page.value.background
  return {
    width: `${page.value.width}px`,
    height: `${page.value.height}px`,
    backgroundColor: color,
    backgroundImage: image ? `url("${image}")` : undefined,
  }
})
</script>

<template>
  <div class="page" :class="`is-${page.background.style}`" :style="backgroundStyle" data-testid="screen-page">
    <div class="page__decor" />
    <WidgetHost v-for="widget in screen.widgets" :key="widget.id" :widget="widget" :editing="editing" />
  </div>
</template>

<style scoped>
.page {
  position: relative;
  overflow: hidden;
  background-position: center;
  background-size: cover;
  color: #e2e8f0;
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}
.page.is-capturing :deep(*),
.page.is-capturing :deep(*::before),
.page.is-capturing :deep(*::after) {
  animation: none !important;
  transition: none !important;
}
.page__decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.page.is-grid .page__decor {
  background-image:
    linear-gradient(rgb(56 189 248 / 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgb(56 189 248 / 0.06) 1px, transparent 1px),
    radial-gradient(ellipse at 50% 0%, rgb(56 189 248 / 0.16), transparent 60%);
  background-size:
    48px 48px,
    48px 48px,
    100% 100%;
}
.page.is-glow .page__decor {
  background:
    radial-gradient(ellipse at 50% -10%, rgb(56 189 248 / 0.28), transparent 55%),
    radial-gradient(ellipse at 0% 100%, rgb(45 212 191 / 0.16), transparent 50%),
    radial-gradient(ellipse at 100% 100%, rgb(129 140 248 / 0.16), transparent 50%);
}
.page.is-stars .page__decor {
  background-image:
    radial-gradient(1.5px 1.5px at 20% 30%, rgb(255 255 255 / 0.6), transparent),
    radial-gradient(1px 1px at 70% 20%, rgb(255 255 255 / 0.5), transparent),
    radial-gradient(1.5px 1.5px at 40% 80%, rgb(255 255 255 / 0.4), transparent),
    radial-gradient(1px 1px at 85% 65%, rgb(255 255 255 / 0.5), transparent),
    radial-gradient(ellipse at 50% 120%, rgb(56 189 248 / 0.2), transparent 60%);
  background-size:
    300px 300px,
    260px 260px,
    340px 340px,
    220px 220px,
    100% 100%;
}
</style>
