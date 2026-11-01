<script setup lang="ts">
import { Copy, Pencil, Trash2, Users } from 'lucide-vue-next'
import { type ApiDataset, refreshLabel } from '../model'

/**
 * 一个数据服务下的接口，按分组列出：方法、名称和说明、路径、参数 / 字段数、刷新频率、被几个大屏使用。
 * 双击或点铅笔打开编辑与测试。
 */
defineProps<{
  groups: Array<[string, ApiDataset[]]>
  /** 接口 id → 使用它的大屏名称。 */
  usage: Map<string, string[]>
}>()
const emit = defineEmits<{
  edit: [dataset: ApiDataset]
  duplicate: [dataset: ApiDataset]
  remove: [dataset: ApiDataset]
}>()
</script>

<template>
  <div class="datasets">
    <section v-for="[group, items] in groups" :key="group" class="group">
      <h3>
        {{ group }} <span>{{ items.length }}</span>
      </h3>
      <article
        v-for="item in items"
        :key="item.id"
        class="dataset"
        :data-testid="`dataset-${item.name}`"
        @dblclick="emit('edit', item)"
      >
        <span class="method" :class="item.method">{{ item.method }}</span>
        <div class="dataset__text">
          <strong>{{ item.name }}</strong>
          <p>{{ item.description || '—' }}</p>
        </div>
        <span class="dataset__path s-mono" :title="item.path">{{ item.path }}</span>
        <span class="dataset__meta">
          {{ item.params.length }} 个参数 ·
          {{ item.resultShape === 'value' ? '单个值' : `${item.fields.length} 个字段` }} ·
          {{ refreshLabel(item.refresh) }}
        </span>
        <span class="dataset__usage" :title="(usage.get(item.id) ?? []).join('、')">
          <Users :size="12" />{{ usage.get(item.id)?.length ?? 0 }}
        </span>
        <div class="dataset__actions">
          <button class="s-icon-btn" title="编辑与测试" @click="emit('edit', item)"><Pencil :size="14" /></button>
          <button class="s-icon-btn" title="复制" @click="emit('duplicate', item)"><Copy :size="14" /></button>
          <button class="s-icon-btn" title="删除" @click="emit('remove', item)"><Trash2 :size="14" /></button>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.group h3 {
  margin: 16px 0 6px;
  color: var(--s-fg-2);
  font-size: 12px;
  font-weight: 550;
}
.group h3 span {
  margin-left: 4px;
  color: var(--s-fg-3);
  font-weight: 400;
}
.dataset {
  display: grid;
  grid-template-columns: 48px minmax(160px, 1.3fr) minmax(120px, 1fr) auto 44px auto;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-panel-2);
}
.dataset + .dataset {
  margin-top: 6px;
}
.dataset:hover {
  border-color: var(--s-line-2);
}
.method {
  padding: 2px 0;
  border-radius: 3px;
  background: color-mix(in srgb, var(--s-ok) 15%, transparent);
  color: var(--s-ok);
  font: 600 10.5px var(--s-mono);
  text-align: center;
}
.method.PUT {
  background: color-mix(in srgb, var(--s-warn) 15%, transparent);
  color: var(--s-warn);
}
.dataset__text {
  min-width: 0;
}
.dataset__text strong {
  font-size: 13px;
  font-weight: 550;
}
.dataset__path {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--s-fg-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dataset__meta {
  color: var(--s-fg-3);
  font-size: 11.5px;
  white-space: nowrap;
}
.dataset__usage {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--s-fg-3);
  font-size: 11.5px;
}
.dataset__actions {
  display: flex;
}
</style>
