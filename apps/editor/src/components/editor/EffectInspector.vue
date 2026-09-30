<script setup lang="ts">
import InspectorSection from './InspectorSection.vue'
import { computed } from 'vue'
import { bindingTargetFromObject, effectDefinitions, twinBindingTargetKey } from '@twin-studio/core'
import EffectParameterFields from './EffectParameterFields.vue'
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
  <InspectorSection title="特效" :meta="selectedEffects.length || ''" data-testid="effect-inspector">
    <p v-if="!selectedEffects.length" class="st-hint">从底部「特效」面板为当前对象添加</p>
    <div v-for="effect in selectedEffects" :key="effect.id" :data-effect-id="effect.id" class="st-item space-y-2">
      <div class="flex items-center justify-between text-[12px]">
        <span class="font-medium text-fg">{{ effectDefinitions.find(d => d.kind === effect.kind)?.name }}</span>
        <button
          :data-testid="`remove-effect-${effect.kind}`"
          class="st-link st-link--danger"
          type="button"
          @click="effects.remove(effect.id)"
        >
          删除
        </button>
      </div>
      <EffectParameterFields
        :kind="effect.kind"
        :parameters="effect.parameters"
        @change="parameters => effects.update(effect.id, parameters)"
      />
    </div>
  </InspectorSection>
</template>
