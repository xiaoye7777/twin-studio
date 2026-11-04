<script setup lang="ts">
import { FlaskConical, Server } from 'lucide-vue-next'
import type { ApiConnection } from '../model'
import { useDataSourceStore } from '../store'

/** 「数据接口」页左侧：数据服务列表（后面的数字是接口个数），没有演示服务时多一个「添加演示数据服务」。 */
defineProps<{ selectedId: string | undefined; showDemo: boolean; busy: boolean }>()
const emit = defineEmits<{ select: [connection: ApiConnection]; demo: [] }>()
const store = useDataSourceStore()
</script>

<template>
  <aside class="services">
    <button
      v-for="connection in store.connections"
      :key="connection.id"
      class="service"
      :class="{ 'is-active': selectedId === connection.id }"
      :data-testid="`connection-${connection.name}`"
      @click="emit('select', connection)"
    >
      <Server :size="15" />
      <span class="service__text">
        <strong>{{ connection.name }}</strong>
        <small>{{ connection.baseUrl }}</small>
      </span>
      <em>{{ store.datasetsOf(connection.id).length }}</em>
    </button>
    <button v-if="showDemo" class="service service--demo" :disabled="busy" data-testid="add-demo" @click="emit('demo')">
      <FlaskConical :size="15" />
      <span class="service__text">
        <strong>添加演示数据服务</strong>
        <small>设备模拟器自带的演示接口</small>
      </span>
    </button>
  </aside>
</template>

<style scoped>
.services {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.service {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--s-fg-2);
  text-align: left;
  cursor: pointer;
}
.service:hover {
  background: var(--s-panel);
}
.service.is-active {
  border-color: var(--s-line-2);
  background: var(--s-panel);
  color: var(--s-fg);
}
.service--demo {
  border: 1px dashed var(--s-line-2);
}
.service__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.service__text strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.service__text small {
  overflow: hidden;
  color: var(--s-fg-3);
  font-family: var(--s-mono);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.service em {
  padding: 0 7px;
  border-radius: 9px;
  background: var(--s-raised);
  color: var(--s-fg-2);
  font-size: 11px;
  font-style: normal;
}
</style>
