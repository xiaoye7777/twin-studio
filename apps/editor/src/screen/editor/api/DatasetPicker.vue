<script setup lang="ts">
import { ExternalLink, Search } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ApiDataset } from '../../datasources/model'
import { useScreenSession } from '../session'
import { openDataSourceCenter } from './openDataSourceCenter'

/** 选择接口：显示当前选中的接口，点开是按服务和分组排列、可搜索的列表。 */
const props = defineProps<{ datasetId: string }>()
const emit = defineEmits<{ pick: [dataset: ApiDataset] }>()
const sources = useScreenSession().runtime.sources
const dataset = computed(() => sources.dataset(props.datasetId))
const connection = computed(() => sources.connection(dataset.value?.connectionId))

const picking = ref(false)
const query = ref('')
const pickerElement = ref<HTMLElement>()
/** 点别处就收起列表。 */
function closeOutside(event: PointerEvent): void {
  if (!pickerElement.value?.contains(event.target as Node)) picking.value = false
}
watch(picking, open => {
  if (open) document.addEventListener('pointerdown', closeOutside, true)
  else document.removeEventListener('pointerdown', closeOutside, true)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside, true))

/** 按「服务 · 分组」（只有一个服务时只按分组）归类，搜索名称、分组、说明和路径。 */
const choices = computed(() => {
  const words = query.value.trim().toLowerCase()
  const groups = new Map<string, ApiDataset[]>()
  for (const item of sources.datasets) {
    const owner = sources.connection(item.connectionId)
    if (!owner) continue
    const haystack = `${item.name} ${item.group} ${item.description} ${item.path}`.toLowerCase()
    if (words && !haystack.includes(words)) continue
    const title = sources.connections.length > 1 ? `${owner.name} · ${item.group}` : item.group
    groups.set(title, [...(groups.get(title) ?? []), item])
  }
  return [...groups]
})

function pick(item: ApiDataset): void {
  picking.value = false
  query.value = ''
  emit('pick', item)
}
const openCenter = () => openDataSourceCenter()
</script>

<template>
  <div ref="pickerElement" class="picker" @keydown.esc.stop="picking = false">
    <button class="picker__current" data-testid="api-dataset" @click="picking = !picking">
      <template v-if="dataset">
        <strong>{{ dataset.name }}</strong>
        <span>{{ connection?.name }} · {{ dataset.group }}</span>
      </template>
      <template v-else>
        <strong class="is-empty">{{ datasetId ? '接口已被删除，请重新选择' : '选择接口…' }}</strong>
        <span>从「数据接口」中登记的接口里选择</span>
      </template>
    </button>
    <div v-if="picking" class="picker__menu" data-testid="api-dataset-menu">
      <label class="picker__search">
        <Search :size="13" />
        <input v-model="query" placeholder="搜索接口名称、分组" autofocus />
      </label>
      <div class="picker__list s-scroll">
        <template v-for="[group, items] in choices" :key="group">
          <div class="picker__group">{{ group }}</div>
          <button
            v-for="item in items"
            :key="item.id"
            class="picker__item"
            :class="{ 'is-active': item.id === datasetId }"
            :data-testid="`api-option-${item.name}`"
            @click="pick(item)"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ item.description || `${item.method} ${item.path}` }}</span>
          </button>
        </template>
        <p v-if="!choices.length" class="picker__none s-hint">
          {{ sources.datasets.length ? '没有匹配的接口' : '还没有登记任何接口' }}
        </p>
      </div>
      <button class="picker__manage" @click="openCenter()"><ExternalLink :size="12" />管理数据接口</button>
    </div>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
  padding: 0 12px;
}
.picker__current {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 7px 9px;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
  color: var(--s-fg);
  text-align: left;
  cursor: pointer;
}
.picker__current:hover {
  border-color: var(--s-line-strong);
}
.picker__current strong {
  font-size: 12.5px;
  font-weight: 550;
}
.picker__current strong.is-empty {
  color: var(--s-accent-2);
}
.picker__current span {
  color: var(--s-fg-3);
  font-size: 11px;
}
.picker__menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  right: 12px;
  left: 12px;
  display: flex;
  max-height: 360px;
  flex-direction: column;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius);
  background: var(--s-panel-2);
  box-shadow: var(--s-shadow);
}
.picker__search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--s-line);
  color: var(--s-fg-3);
}
.picker__search input {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--s-fg);
  font-size: 12px;
  outline: none;
}
.picker__list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 4px;
}
.picker__group {
  padding: 8px 8px 4px;
  color: var(--s-fg-3);
  font-size: 11px;
}
.picker__item {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--s-radius-sm);
  background: transparent;
  color: var(--s-fg);
  text-align: left;
  cursor: pointer;
}
.picker__item:hover {
  background: var(--s-hover);
}
.picker__item.is-active {
  background: var(--s-accent-soft);
}
.picker__item strong {
  font-size: 12px;
  font-weight: 500;
}
.picker__item span {
  overflow: hidden;
  max-width: 100%;
  color: var(--s-fg-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker__none {
  padding: 12px;
  text-align: center;
}
.picker__manage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 0;
  border-top: 1px solid var(--s-line);
  background: transparent;
  color: var(--s-fg-2);
  font-size: 11.5px;
  cursor: pointer;
}
.picker__manage:hover {
  color: var(--s-fg);
}
</style>
