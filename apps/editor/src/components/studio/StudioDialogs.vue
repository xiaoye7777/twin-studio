<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive, watch } from 'vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import { useSession } from '@/studio/context'
import { deviceIdFor, deviceTemplates } from '@/studio/deviceTemplates'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const visible = computed({
  get: () => shell.dialog !== null,
  set: value => {
    if (!value) shell.dialog = null
  },
})
const title = computed(() =>
  shell.dialog === 'batch-bind' ? '批量绑定设备' : shell.dialog === 'array' ? '阵列复制' : '快捷键',
)

const bind = reactive({
  templateId: deviceTemplates[0]!.id,
  prefix: deviceTemplates[0]!.prefix,
  start: 1,
  name: deviceTemplates[0]!.name,
})
watch(
  () => bind.templateId,
  id => {
    const template = deviceTemplates.find(item => item.id === id)
    if (template) {
      bind.prefix = template.prefix
      bind.name = template.name
    }
  },
)
const bindPreview = computed(() => {
  const count = session.selection.value.length
  if (!count) return ''
  const first = deviceIdFor(bind.prefix, bind.start)
  const last = deviceIdFor(bind.prefix, bind.start + count - 1)
  return count === 1 ? first : `${first} … ${last}`
})
function runBind(): void {
  const template = deviceTemplates.find(item => item.id === bind.templateId)
  if (!template || !bind.prefix.trim()) return
  // Bind in the order objects appear in the scene tree, so numbering follows the layout.
  const order = new Map(session.doc.value.nodes.map((node, index) => [node.id, index]))
  const ids = [...session.selection.value].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  const count = session.batchBind(ids, template, bind.prefix.trim(), bind.start, bind.name.trim() || template.name)
  ElMessage.success(`已绑定 ${count} 台${template.name}`)
  shell.dialog = null
}

const array = reactive({ count: 4, x: 5, y: 0, z: 0 })
function runArray(): void {
  session.arrayDuplicate(Math.max(1, Math.round(array.count)), [array.x, array.y, array.z])
  shell.dialog = null
}

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
const shortcuts: Array<[string, string]> = [
  ['Q / W / E / R', '选择 / 移动 / 旋转 / 缩放'],
  ['F', '聚焦选中对象'],
  ['双击对象', '选中最内层并聚焦'],
  ['Alt + 单击', '直接选中组内对象'],
  ['Shift / ' + mod + ' + 单击', '多选'],
  [`${mod} + Z / ${mod} + Shift + Z`, '撤销 / 重做'],
  [`${mod} + D`, '创建副本'],
  [`${mod} + C / V`, '复制 / 粘贴'],
  [`${mod} + G / ${mod} + Shift + G`, '组合 / 取消组合'],
  [`${mod} + S`, '保存（另有自动保存）'],
  ['Delete', '删除'],
  ['H', '显示 / 隐藏'],
  ['End', '放到地面'],
  ['0 / 7 / 1 / 3', '透视 / 顶 / 前 / 右视图'],
  ['P / Esc', '进入 / 退出预览'],
  ['Enter / Backspace / Esc', '绘制时：完成 / 撤销点 / 取消'],
  ['鼠标左键 / 右键 / 滚轮', '旋转 / 平移 / 缩放镜头'],
]
</script>

<template>
  <el-dialog v-model="visible" :title="title" width="440px" append-to-body class="studio-dialog">
    <template v-if="shell.dialog === 'batch-bind'">
      <div class="form">
        <label>设备类型</label>
        <select v-model="bind.templateId" class="s-select" data-testid="batch-template">
          <option v-for="template in deviceTemplates" :key="template.id" :value="template.id">
            {{ template.name }}
          </option>
        </select>
        <label>编号前缀</label>
        <input v-model="bind.prefix" class="s-input s-mono" data-testid="batch-prefix" />
        <label>起始编号</label>
        <UiNumber
          :model-value="bind.start"
          :min="0"
          :max="9999"
          :step="1"
          :precision="0"
          @update="bind.start = $event"
        />
        <label>名称前缀</label>
        <input v-model="bind.name" class="s-input" />
      </div>
      <p class="preview">
        将为 {{ session.selection.value.length }} 个对象绑定设备：<b class="s-mono">{{ bindPreview }}</b>
      </p>
    </template>
    <template v-else-if="shell.dialog === 'array'">
      <div class="form">
        <label>复制份数</label>
        <UiNumber
          :model-value="array.count"
          :min="1"
          :max="200"
          :step="1"
          :precision="0"
          @update="array.count = $event"
        />
        <label>间距 X</label>
        <UiNumber :model-value="array.x" :step="0.5" unit="m" @update="array.x = $event" />
        <label>间距 Y</label>
        <UiNumber :model-value="array.y" :step="0.5" unit="m" @update="array.y = $event" />
        <label>间距 Z</label>
        <UiNumber :model-value="array.z" :step="0.5" unit="m" @update="array.z = $event" />
      </div>
      <p class="preview">适合成排的储能柜、光伏板、充电桩。设备绑定不会被复制，复制后可批量绑定。</p>
    </template>
    <template v-else>
      <div class="keys">
        <template v-for="[key, action] in shortcuts" :key="key">
          <span class="keys__key">{{ key }}</span
          ><span>{{ action }}</span>
        </template>
      </div>
    </template>
    <template v-if="shell.dialog === 'batch-bind' || shell.dialog === 'array'" #footer>
      <button class="s-btn" @click="shell.dialog = null">取消</button>
      <button
        class="s-btn s-btn--primary"
        data-testid="dialog-confirm"
        @click="shell.dialog === 'batch-bind' ? runBind() : runArray()"
      >
        确定
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: 10px 12px;
}
.form label {
  color: #a9a6a0;
  font-size: 12px;
}
.preview {
  margin: 14px 0 0;
  color: #a9a6a0;
  font-size: 12px;
  line-height: 1.6;
}
.keys {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 7px 18px;
  font-size: 12px;
}
.keys__key {
  color: #f4ab78;
  font-family: 'SF Mono', ui-monospace, Menlo, monospace;
  font-size: 11px;
  white-space: nowrap;
}
</style>
