<script setup lang="ts">
import { computed, ref } from 'vue'
import { effectDefinitions } from '@/domain/effects'
import { bindingTargetFromObject } from '@/editor/services/BindingTargetResolver'
import { useEditorStore } from '@/stores/editor'
import { useEffectsStore } from '@/stores/effects'
const editor = useEditorStore()
const effects = useEffectsStore()
const category = ref('全部')
const target = computed(() => editor.selectedObject ? bindingTargetFromObject(editor.selectedObject) : null)
const definitions = computed(() => effectDefinitions.filter(d => category.value === '全部' || d.category === category.value))
</script>

<template>
  <div data-testid="effect-library" class="h-[124px] overflow-auto px-4 py-2">
    <div class="mb-2 flex gap-3 text-xs">
      <button v-for="item in ['全部', '告警', '高亮', '标注']" :key="item" :class="category === item ? 'text-blue-400' : 'text-slate-400'" @click="category = item">{{ item }}</button>
      <span v-if="!target" class="text-slate-500">请先选择场景对象</span>
    </div>
    <div class="flex gap-2">
      <button v-for="definition in definitions" :key="definition.kind" :data-testid="`add-effect-${definition.kind}`" :disabled="!target || !editor.runtimeReady" class="h-14 shrink-0 rounded-lg bg-slate-900/45 px-4 text-xs hover:bg-slate-700 disabled:opacity-40" @click="target && effects.add(definition.kind, target)">{{ definition.name }}</button>
    </div>
  </div>
</template>
