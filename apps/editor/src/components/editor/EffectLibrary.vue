<script setup lang="ts">
import { MagicStick } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { bindingTargetFromObject, effectDefinitions } from '@twin-studio/core'
import { useEditorStore } from '@/stores/editor'
import { useEffectsStore } from '@/stores/effects'
const editor = useEditorStore()
const effects = useEffectsStore()
const category = ref('全部')
const target = computed(() => editor.selectedObject ? bindingTargetFromObject(editor.selectedObject) : null)
const definitions = computed(() => effectDefinitions.filter(d => category.value === '全部' || d.category === category.value))
</script>

<template>
  <div data-testid="effect-library" class="flex min-h-0 flex-1 flex-col">
    <nav class="flex h-8 shrink-0 items-center gap-1 px-3">
      <button v-for="item in ['全部', '告警', '高亮', '标注']" :key="item" class="chip" :class="{ 'is-active': category === item }" type="button" @click="category = item">{{ item }}</button>
      <span class="ml-auto text-[11px]" :class="target ? 'text-fg-3' : 'text-warn'">{{ target ? '点击为选中对象添加特效' : '请先在场景中选择对象' }}</span>
    </nav>
    <div class="min-h-0 flex-1 overflow-auto px-3 pb-2.5">
      <div class="flex min-w-max gap-2">
        <button v-for="definition in definitions" :key="definition.kind" :data-testid="`add-effect-${definition.kind}`" :disabled="!target || !editor.runtimeReady" class="tile w-36" type="button" @click="target && effects.add(definition.kind, target)">
          <span class="tile__icon"><el-icon :size="16"><MagicStick /></el-icon></span>
          <span class="min-w-0 text-left"><span class="block truncate text-[12px] text-fg">{{ definition.name }}</span><span class="mt-0.5 block text-[11px] text-fg-3">{{ definition.category }}</span></span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chip { display:inline-flex; height:22px; align-items:center; border-radius:4px; padding:0 9px; font-size:11.5px; color:var(--color-fg-2); }
.chip:hover { background:var(--color-hover); color:var(--color-fg); }
.chip.is-active { background:var(--color-active); color:var(--color-fg); }
.tile { display:flex; height:56px; flex-shrink:0; align-items:center; gap:10px; border:1px solid var(--color-line); border-radius:6px; background:var(--color-field); padding:0 10px; transition:border-color 120ms ease, background-color 120ms ease; }
.tile:hover:not(:disabled) { border-color:var(--color-line-strong); background:var(--color-raised); }
.tile:disabled { cursor:not-allowed; opacity:.4; }
.tile__icon { display:grid; height:34px; width:34px; flex-shrink:0; place-items:center; border-radius:5px; background:var(--color-raised); color:var(--color-fg-2); }
.tile:hover:not(:disabled) .tile__icon { color:var(--color-accent-fg); }
</style>
