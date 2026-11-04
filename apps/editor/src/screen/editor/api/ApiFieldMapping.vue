<script setup lang="ts">
import { ArrowDown, ArrowUp } from 'lucide-vue-next'
import { computed } from 'vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import type { ApiUse } from '../../datasources/mapping'
import type { ApiBinding, ApiDataset, ApiReduce } from '../../datasources/model'

/**
 * 接口返回的字段怎么用，按组件类型不同：
 *   指标类（value）  选一个字段；多行时怎么合成一个数（合计、平均……）
 *   图表（chart）    分类字段 + 数值字段（每个数值字段一条系列）
 *   表格类（table）  勾选要显示的列并排序
 * 多行数据还可以排序、限制条数。
 */
const props = defineProps<{ binding: ApiBinding; dataset: ApiDataset; use: ApiUse }>()
const emit = defineEmits<{ update: [patch: Partial<ApiBinding>, label?: string] }>()
const update = (patch: Partial<ApiBinding>, label?: string) => emit('update', patch, label)

const fields = computed(() => props.dataset.fields)
const numericFields = computed(() => fields.value.filter(field => field.type === 'number'))
const fieldLabel = (key: string) => fields.value.find(field => field.key === key)?.label ?? key

function toggleIn(list: string[] | undefined, key: string): string[] {
  const items = list ?? []
  return items.includes(key) ? items.filter(item => item !== key) : [...items, key]
}
/** 调整列的顺序。 */
function move(key: string, step: -1 | 1): void {
  const columns = [...(props.binding.columns ?? [])]
  const index = columns.indexOf(key)
  const target = index + step
  if (index < 0 || target < 0 || target >= columns.length) return
  ;[columns[index], columns[target]] = [columns[target]!, columns[index]!]
  update({ columns }, '调整列顺序')
}
const reduceChoices: Array<{ value: ApiReduce; label: string }> = [
  { value: 'first', label: '第一行' },
  { value: 'last', label: '最后一行' },
  { value: 'sum', label: '合计' },
  { value: 'avg', label: '平均' },
  { value: 'max', label: '最大' },
  { value: 'min', label: '最小' },
  { value: 'count', label: '行数' },
]
</script>

<template>
  <template v-if="use === 'value'">
    <UiRow label="显示字段">
      <select
        class="s-select"
        :value="binding.value ?? ''"
        data-testid="api-value-field"
        @change="update({ value: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="field in fields" :key="field.key" :value="field.key">
          {{ field.label }}{{ field.unit ? `（${field.unit}）` : '' }}
        </option>
      </select>
    </UiRow>
    <UiRow v-if="dataset.resultShape === 'rows'" label="多行时" hint="接口返回多行数据时，如何得到一个数">
      <select
        class="s-select"
        :value="binding.reduce ?? 'first'"
        @change="update({ reduce: ($event.target as HTMLSelectElement).value as ApiReduce })"
      >
        <option v-for="choice in reduceChoices" :key="choice.value" :value="choice.value">
          {{ choice.label }}
        </option>
      </select>
    </UiRow>
  </template>

  <template v-else-if="use === 'chart'">
    <UiRow label="分类（X 轴）">
      <select
        class="s-select"
        :value="binding.dimension ?? ''"
        data-testid="api-dimension"
        @change="update({ dimension: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="field in fields" :key="field.key" :value="field.key">{{ field.label }}</option>
      </select>
    </UiRow>
    <UiRow label="数值（系列）" stack>
      <div class="checks">
        <label v-for="field in numericFields" :key="field.key">
          <input
            type="checkbox"
            :checked="binding.measures?.includes(field.key)"
            :data-testid="`api-measure-${field.key}`"
            @change="update({ measures: toggleIn(binding.measures, field.key) })"
          />{{ field.label }}{{ field.unit ? `（${field.unit}）` : '' }}
        </label>
        <span v-if="!numericFields.length" class="s-hint">接口没有数值字段</span>
      </div>
    </UiRow>
  </template>

  <template v-else>
    <UiRow label="显示的列" stack>
      <div class="columns">
        <div v-for="key in binding.columns ?? []" :key="key" class="columns__item">
          <input type="checkbox" checked @change="update({ columns: toggleIn(binding.columns, key) })" />
          <span>{{ fieldLabel(key) }}</span>
          <button class="s-icon-btn" title="上移" @click="move(key, -1)"><ArrowUp :size="12" /></button>
          <button class="s-icon-btn" title="下移" @click="move(key, 1)"><ArrowDown :size="12" /></button>
        </div>
        <label
          v-for="field in fields.filter(field => !binding.columns?.includes(field.key))"
          :key="field.key"
          class="columns__item is-off"
        >
          <input type="checkbox" @change="update({ columns: toggleIn(binding.columns, field.key) })" />
          <span>{{ field.label }}</span>
        </label>
      </div>
    </UiRow>
  </template>

  <UiRow v-if="dataset.resultShape === 'rows'" label="排序">
    <select
      class="s-select"
      :value="binding.sort?.field ?? ''"
      @change="
        update({
          sort: ($event.target as HTMLSelectElement).value
            ? { field: ($event.target as HTMLSelectElement).value, order: binding.sort?.order ?? 'desc' }
            : undefined,
        })
      "
    >
      <option value="">接口原顺序</option>
      <option v-for="field in fields" :key="field.key" :value="field.key">{{ field.label }}</option>
    </select>
    <select
      v-if="binding.sort"
      class="s-select order"
      :value="binding.sort.order"
      @change="
        update({
          sort: { field: binding.sort!.field, order: ($event.target as HTMLSelectElement).value as 'asc' | 'desc' },
        })
      "
    >
      <option value="desc">从大到小</option>
      <option value="asc">从小到大</option>
    </select>
  </UiRow>
  <UiRow v-if="dataset.resultShape === 'rows'" label="最多显示">
    <UiNumber
      :model-value="binding.limit ?? 0"
      :min="0"
      :max="1000"
      :step="1"
      :precision="0"
      unit="条"
      @update="update({ limit: Math.round($event) || undefined }, '显示条数')"
    />
  </UiRow>
  <p v-if="dataset.resultShape === 'rows'" class="s-note s-hint">最多显示为 0 时显示全部。</p>
</template>

<style scoped>
.order {
  width: 92px;
  flex-shrink: 0;
}
.checks {
  display: flex;
  max-height: 150px;
  flex-wrap: wrap;
  gap: 4px 10px;
  overflow: auto;
  color: var(--s-fg-2);
  font-size: 12px;
}
.checks label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.columns {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 1px;
}
.columns__item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 4px;
  border-radius: var(--s-radius-sm);
  color: var(--s-fg);
  font-size: 12px;
}
.columns__item span {
  flex: 1;
}
.columns__item .s-icon-btn {
  width: 20px;
  height: 20px;
}
.columns__item.is-off {
  color: var(--s-fg-3);
  cursor: pointer;
}
</style>
