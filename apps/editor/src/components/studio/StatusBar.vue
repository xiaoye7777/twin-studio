<script setup lang="ts">
import { computed } from 'vue'
import { nodeKindLabels, useSession } from '@/studio/context'

const session = useSession()
const ui = session.ui
const twin = session.twin
const selection = computed(() => {
  const nodes = session.selection.value.flatMap(id => session.node(id) ?? [])
  if (!nodes.length) return '未选择'
  if (nodes.length === 1) return `${nodeKindLabels[nodes[0]!.kind]} · ${nodes[0]!.name}`
  return `已选 ${nodes.length} 个对象`
})
const dataLabel = computed(() => {
  const labels: Record<string, string> = {
    unconfigured: '数据源未启用',
    connecting: '数据源连接中',
    connected: `实时数据 · ${twin.dataSourceMessageCount} 条`,
    disconnected: '数据源已断开',
    error: '数据源错误',
  }
  return labels[twin.dataSourceStatus] ?? twin.dataSourceStatus
})
const cursor = computed(() => (ui.cursor ? ui.cursor.map(value => value.toFixed(1)).join(', ') : '—'))
</script>

<template>
  <footer class="status" data-testid="status-bar">
    <span class="status__item">{{ selection }}</span>
    <span class="status__item" :class="`is-${twin.dataSourceStatus}`" data-testid="status-data">
      <span class="s-dot" />{{ dataLabel }}
    </span>
    <span v-if="ui.warnings.length" class="status__item is-warning" :title="ui.warnings.join('\n')">
      {{ ui.warnings.length }} 条提示
    </span>
    <span class="status__spacer" />
    <span class="status__item s-mono">X, Y, Z {{ cursor }}</span>
    <span class="status__item s-mono">{{ ui.stats.fps }} FPS · ×{{ ui.stats.pixelRatio }}</span>
    <span class="status__item">Twin Studio · 场景格式 v2</span>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 10px;
  border-top: 1px solid var(--s-line);
  background: var(--s-panel);
  color: var(--s-fg-3);
  font-size: 11px;
}
.status__item {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.status__item .s-dot {
  color: #55565b;
}
.status__item.is-connected .s-dot {
  color: var(--s-ok);
  box-shadow: 0 0 6px var(--s-ok);
}
.status__item.is-connecting .s-dot {
  color: var(--s-warn);
}
.status__item.is-error .s-dot,
.status__item.is-disconnected .s-dot {
  color: var(--s-danger);
}
.status__item.is-warning {
  color: var(--s-warn);
}
.status__spacer {
  flex: 1;
}
</style>
