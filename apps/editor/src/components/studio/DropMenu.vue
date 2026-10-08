<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

export interface MenuItem {
  label?: string
  shortcut?: string
  action?: () => void
  disabled?: boolean
  divider?: boolean
  checked?: boolean
}

defineProps<{ label: string; items: MenuItem[]; testid?: string }>()
const open = ref(false)
const root = ref<HTMLElement>()

function onDocument(event: PointerEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}
function toggle(): void {
  open.value = !open.value
  if (open.value) document.addEventListener('pointerdown', onDocument)
  else document.removeEventListener('pointerdown', onDocument)
}
function run(item: MenuItem): void {
  if (item.disabled || item.divider) return
  open.value = false
  document.removeEventListener('pointerdown', onDocument)
  item.action?.()
}
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocument))
</script>

<template>
  <div ref="root" class="drop-menu">
    <button type="button" class="drop-menu__trigger" :class="{ 'is-open': open }" :data-testid="testid" @click="toggle">
      {{ label }}
    </button>
    <div v-if="open" class="drop-menu__panel s-float" role="menu">
      <template v-for="(item, index) in items" :key="index">
        <div v-if="item.divider" class="drop-menu__divider" />
        <button
          v-else
          type="button"
          role="menuitem"
          class="drop-menu__item"
          :disabled="item.disabled"
          @click="run(item)"
        >
          <span class="drop-menu__check">{{ item.checked ? '✓' : '' }}</span>
          <span class="drop-menu__label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="drop-menu__shortcut">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.drop-menu {
  position: relative;
}
.drop-menu__trigger {
  height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--s-radius-sm);
  background: transparent;
  color: var(--s-fg-2);
  font-size: 12px;
  cursor: pointer;
}
.drop-menu__trigger:hover,
.drop-menu__trigger.is-open {
  background: var(--s-hover);
  color: var(--s-fg);
}
.drop-menu__panel {
  position: absolute;
  z-index: 50;
  top: calc(100% + 4px);
  left: 0;
  min-width: 220px;
  padding: 4px;
}
.drop-menu__item {
  display: flex;
  width: 100%;
  height: 28px;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--s-fg);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.drop-menu__item:hover:not(:disabled) {
  background: var(--s-accent-soft);
  color: var(--s-accent-2);
}
.drop-menu__item:disabled {
  color: var(--s-fg-3);
  cursor: default;
}
.drop-menu__check {
  width: 14px;
  color: var(--s-accent-2);
  text-align: center;
}
.drop-menu__label {
  flex: 1;
}
.drop-menu__shortcut {
  color: var(--s-fg-3);
  font-family: var(--s-mono);
  font-size: 10.5px;
}
.drop-menu__divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--s-line-2);
}
</style>
