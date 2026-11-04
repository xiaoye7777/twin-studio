<script setup lang="ts">
import { computed } from 'vue'
import type { MenuSections } from '@/components/ui/menu'
import UiDropdown from '@/components/ui/UiDropdown.vue'

/** 顶栏的菜单（文件、编辑、添加、视图）：一个文字按钮 + 下拉菜单。`divider` 项分隔成组。 */
export interface MenuItem {
  label?: string
  shortcut?: string
  action?: () => void
  disabled?: boolean
  divider?: boolean
  checked?: boolean
}

const props = defineProps<{ label: string; items: MenuItem[]; testid?: string }>()

const sections = computed<MenuSections>(() => {
  const groups: MenuSections = [[]]
  for (const item of props.items) {
    if (item.divider) groups.push([])
    else
      groups.at(-1)!.push({
        label: item.label ?? '',
        shortcut: item.shortcut,
        disabled: item.disabled,
        checked: item.checked,
        action: () => item.action?.(),
      })
  }
  return groups
})
</script>

<template>
  <UiDropdown :sections="sections" :width="230">
    <template #default="{ toggle, open }">
      <button type="button" class="drop-menu" :class="{ 'is-open': open }" :data-testid="testid" @click="toggle">
        {{ label }}
      </button>
    </template>
  </UiDropdown>
</template>

<style scoped>
.drop-menu {
  height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--s-radius-sm);
  background: transparent;
  color: var(--s-fg-2);
  font-size: 12px;
  cursor: pointer;
}
.drop-menu:hover,
.drop-menu.is-open {
  background: var(--s-hover);
  color: var(--s-fg);
}
</style>
