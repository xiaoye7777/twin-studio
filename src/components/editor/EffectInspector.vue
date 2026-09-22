<script setup lang="ts">
import { computed } from 'vue'
import { effectDefinitions } from '@/domain/effects'
import EffectParameterFields from './EffectParameterFields.vue'
import { twinBindingTargetKey } from '@/domain/twin'
import { bindingTargetFromObject } from '@/editor/services/BindingTargetResolver'
import { useEditorStore } from '@/stores/editor'
import { useEffectsStore } from '@/stores/effects'
const editor = useEditorStore()
const effects = useEffectsStore()
const selectedEffects = computed(() => {
  const target = editor.selectedObject ? bindingTargetFromObject(editor.selectedObject) : null
  return target ? effects.instances.filter(e => twinBindingTargetKey(e.target) === twinBindingTargetKey(target)) : []
})
</script>

<template>
  <section data-testid="effect-inspector" class="space-y-3 border-t border-slate-700 pt-3">
    <h3 class="text-xs font-semibold text-slate-300">特效</h3>
    <p v-if="!selectedEffects.length" class="text-xs text-slate-500">从底部「特效」资源添加</p>
    <div v-for="effect in selectedEffects" :key="effect.id" :data-effect-id="effect.id" class="space-y-2 rounded bg-slate-900/40 p-2">
      <div class="flex justify-between text-xs"><span>{{ effectDefinitions.find(d => d.kind === effect.kind)?.name }}</span><button :data-testid="`remove-effect-${effect.kind}`" class="text-red-400" @click="effects.remove(effect.id)">删除</button></div>
      <EffectParameterFields :kind="effect.kind" :parameters="effect.parameters" @change="parameters => effects.update(effect.id, parameters)" />
    </div>
  </section>
</template>
