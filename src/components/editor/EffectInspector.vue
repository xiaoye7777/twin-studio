<script setup lang="ts">
import { computed } from 'vue'
import { effectDefinitions, type EffectInstance, type EffectParameters } from '@/domain/effects'
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
const labels: Record<keyof EffectParameters, string> = { color: '颜色', opacity: '强度', speed: '速度', padding: '边距', text: '文字' }
function change(effect: EffectInstance, field: keyof EffectParameters, event: Event): void {
  const value = (event.target as HTMLInputElement).value
  effects.update(effect.id, { ...effect.parameters, [field]: field === 'text' || field === 'color' ? value : Number(value) })
}
</script>

<template>
  <section data-testid="effect-inspector" class="space-y-3 border-t border-slate-700 pt-3">
    <h3 class="text-xs font-semibold text-slate-300">特效</h3>
    <p v-if="!selectedEffects.length" class="text-xs text-slate-500">从底部「特效」资源添加</p>
    <div v-for="effect in selectedEffects" :key="effect.id" :data-effect-id="effect.id" class="space-y-2 rounded bg-slate-900/40 p-2">
      <div class="flex justify-between text-xs"><span>{{ effectDefinitions.find(d => d.kind === effect.kind)?.name }}</span><button :data-testid="`remove-effect-${effect.kind}`" class="text-red-400" @click="effects.remove(effect.id)">删除</button></div>
      <p v-if="effect.kind === 'outline'" class="text-[10px] text-slate-500">Meteor3D 统一琥珀色描边</p>
      <label v-for="field in effectDefinitions.find(d => d.kind === effect.kind)?.fields" :key="field" class="flex items-center justify-between gap-2 text-xs text-slate-400">
        {{ labels[field] }}
        <input :data-testid="`effect-${effect.kind}-${field}`" :aria-label="labels[field]" :type="field === 'color' ? 'color' : field === 'text' ? 'text' : 'number'" :value="effect.parameters[field]" min="0" :max="field === 'opacity' ? 1 : field === 'speed' ? 10 : field === 'padding' ? 100 : undefined" :step="0.1" maxlength="200" class="w-28 rounded bg-slate-700 p-1 text-slate-100" @change="change(effect, field, $event)" />
      </label>
    </div>
  </section>
</template>
