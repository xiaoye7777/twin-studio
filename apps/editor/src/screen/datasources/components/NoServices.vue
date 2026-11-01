<script setup lang="ts">
import { FlaskConical, Plug, Plus, UserCog, Users } from 'lucide-vue-next'

/** 还没有任何数据服务时的欢迎页：说明分工，并给出三个起点。 */
defineProps<{ busy: boolean }>()
const emit = defineEmits<{ add: []; demo: []; curl: [] }>()
</script>

<template>
  <div class="center__empty">
    <Plug :size="28" />
    <h2>还没有数据服务</h2>
    <p>数据服务就是一个后端地址（例如园区业务后台）。添加后，从它的接口文档导入接口，或手动登记。</p>
    <div class="roles">
      <div>
        <UserCog :size="16" /><strong>技术人员 / 后端</strong
        ><span>登记数据服务和接口：地址、认证、参数说明、返回字段</span>
      </div>
      <div>
        <Users :size="16" /><strong>业务人员</strong
        ><span>在大屏组件的「数据」中选择接口、填写参数，不需要看接口文档</span>
      </div>
    </div>
    <div class="center__empty-actions">
      <button class="s-btn s-btn--primary" @click="emit('add')"><Plus :size="14" />添加数据服务</button>
      <button class="s-btn" :disabled="busy" data-testid="add-demo" @click="emit('demo')">
        <FlaskConical :size="14" />{{ busy ? '连接中…' : '使用演示数据服务' }}
      </button>
      <button class="s-btn" @click="emit('curl')"><Plus :size="14" />粘贴 cURL</button>
    </div>
  </div>
</template>

<style scoped>
.center__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 70px 20px;
  border: 1px dashed var(--s-line-2);
  border-radius: 12px;
  color: var(--s-fg-3);
  text-align: center;
}
.center__empty h2 {
  margin: 4px 0 0;
  color: var(--s-fg);
  font-size: 17px;
}
.center__empty p {
  max-width: 520px;
  margin: 0;
}
.roles {
  display: flex;
  gap: 12px;
  margin: 10px 0;
}
.roles div {
  display: grid;
  width: 250px;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--s-panel);
  text-align: left;
}
.roles strong {
  color: var(--s-fg);
}
.roles span {
  grid-column: 1 / -1;
  font-size: 12px;
}
.center__empty-actions {
  display: flex;
  gap: 8px;
}
</style>
