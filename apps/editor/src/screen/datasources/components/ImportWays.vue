<script setup lang="ts">
/** 数据服务还没有接口时，给出四种登记方式（按推荐顺序）。 */
const emit = defineEmits<{ import: [kind: 'openapi' | 'catalog' | 'curl']; create: [] }>()
</script>

<template>
  <div class="ways">
    <button @click="emit('import', 'openapi')">
      <strong>① 导入 Swagger / OpenAPI 文档</strong>
      <span>后端已有接口文档时，一次导入全部接口、参数说明和字段</span>
    </button>
    <button @click="emit('import', 'catalog')">
      <strong>② 同步接口清单</strong>
      <span>后端按约定提供清单地址，带中文名和字段说明，以后一键同步</span>
    </button>
    <button @click="emit('import', 'curl')">
      <strong>③ 粘贴 cURL</strong>
      <span>从浏览器开发者工具复制现有业务页面的请求</span>
    </button>
    <button @click="emit('create')">
      <strong>④ 手动新建</strong>
      <span>填写地址和参数，发送测试请求后自动识别字段</span>
    </button>
  </div>
</template>

<style scoped>
.ways {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.ways button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--s-line-2);
  border-radius: 8px;
  background: var(--s-panel-2);
  color: var(--s-fg);
  text-align: left;
  cursor: pointer;
}
.ways button:hover {
  border-color: var(--s-accent-line);
}
.ways span {
  color: var(--s-fg-3);
  font-size: 12px;
}
</style>
