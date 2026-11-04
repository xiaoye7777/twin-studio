<script setup lang="ts">
import { Link2, Unlink2 } from 'lucide-vue-next'
import { computed } from 'vue'
import type { ApiParam, ParamBinding } from '../../datasources/model'

/**
 * 接口的一个参数：按类型显示下拉、日期、数字或文本框；右侧按钮切换为「跟随大屏变量」。
 */
const props = defineProps<{
  param: ApiParam
  binding: ParamBinding
  /** 可以跟随的变量（自定义变量 + 内置变量）。 */
  variables: Array<{ name: string; label: string }>
}>()
const emit = defineEmits<{ update: [binding: ParamBinding] }>()
const value = computed(() => props.binding.value ?? props.param.default ?? '')

function toggleVariable(): void {
  emit('update', props.binding.variable ? {} : { variable: props.variables[0]?.name ?? '@today' })
}
</script>

<template>
  <select
    v-if="binding.variable"
    class="s-select is-variable"
    :value="binding.variable"
    :data-testid="`api-param-${param.key}`"
    @change="emit('update', { variable: ($event.target as HTMLSelectElement).value })"
  >
    <option v-for="variable in variables" :key="variable.name" :value="variable.name">
      变量：{{ variable.label }}
    </option>
  </select>
  <select
    v-else-if="param.type === 'enum' || param.type === 'boolean'"
    class="s-select"
    :value="value"
    :data-testid="`api-param-${param.key}`"
    @change="emit('update', { value: ($event.target as HTMLSelectElement).value })"
  >
    <option v-if="!param.required" value="">（不限）</option>
    <option
      v-for="option in param.type === 'boolean'
        ? [
            { value: 'true', label: '是' },
            { value: 'false', label: '否' },
          ]
        : (param.options ?? [])"
      :key="option.value"
      :value="option.value"
    >
      {{ option.label }}
    </option>
  </select>
  <input
    v-else
    class="s-input"
    :type="
      param.type === 'number' ? 'number' : param.type === 'date' ? 'date' : param.type === 'month' ? 'month' : 'text'
    "
    :value="value"
    :placeholder="param.required ? '必填' : '留空不传'"
    :data-testid="`api-param-${param.key}`"
    @change="emit('update', { value: ($event.target as HTMLInputElement).value })"
  />
  <button
    class="s-icon-btn"
    :class="{ 'is-active': binding.variable }"
    :title="binding.variable ? '改为固定值' : '跟随大屏变量（筛选器、点击联动）'"
    :data-testid="`api-param-link-${param.key}`"
    @click="toggleVariable()"
  >
    <Unlink2 v-if="binding.variable" :size="13" />
    <Link2 v-else :size="13" />
  </button>
</template>

<style scoped>
.s-select.is-variable {
  border-color: color-mix(in srgb, var(--s-data) 50%, transparent);
  color: var(--s-data);
}
</style>
