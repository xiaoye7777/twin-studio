<script setup lang="ts">
import { effectDefinitions, type EffectKind, type EffectParameters } from '@/domain/effects'
const props = defineProps<{ kind: EffectKind; parameters: EffectParameters; testPrefix?: string }>()
const emit = defineEmits<{ change: [parameters: EffectParameters] }>()
const labels: Record<keyof EffectParameters, string> = { color: '颜色', opacity: '强度', speed: '速度', padding: '边距', text: '文字' }
function change(field: keyof EffectParameters, event: Event): void {
  const value = (event.target as HTMLInputElement).value
  emit('change', { ...props.parameters, [field]: field === 'text' || field === 'color' ? value : Number(value) })
}
</script>

<template>
  <p v-if="kind === 'outline'" class="text-[10px] text-slate-500">Meteor3D 统一琥珀色描边（颜色不随模板变化）</p>
  <label v-for="field in effectDefinitions.find(d => d.kind === kind)?.fields" :key="field" class="flex items-center justify-between gap-2 text-xs text-slate-400">
    {{ labels[field] }}
    <input :data-testid="`${testPrefix ?? `effect-${kind}`}-${field}`" :aria-label="labels[field]" :type="field === 'color' ? 'color' : field === 'text' ? 'text' : 'number'" :value="parameters[field]" min="0" :max="field === 'opacity' ? 1 : field === 'speed' ? 10 : field === 'padding' ? 100 : undefined" :step="0.1" maxlength="200" class="w-36 rounded bg-slate-700 p-1 text-slate-100" @change="change(field, $event)" />
  </label>
</template>
