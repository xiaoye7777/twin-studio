<script setup lang="ts">
const visible = defineModel<boolean>({ required: true })
const mac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = mac ? '⌘' : 'Ctrl'
const shift = mac ? '⇧' : 'Shift'
const alt = mac ? '⌥' : 'Alt'

const groups = [
  {
    title: '编辑',
    items: [
      [`${mod} Z`, '撤销'],
      [`${mod} ${shift} Z`, '重做'],
      [`${mod} C / ${mod} V`, '复制 / 粘贴'],
      [`${mod} D`, '创建副本'],
      [`${mod} A`, '全选'],
      ['Delete', '删除'],
      [`${mod} S`, '立即保存'],
    ],
  },
  {
    title: '排列',
    items: [
      [`${mod} G`, '组合'],
      [`${mod} ${shift} G`, '取消组合'],
      ['双击组合中的组件', '单独选中它'],
      ['] / [', '上移 / 下移一层'],
      ['方向键', '移动 1 px'],
      [`${shift} 方向键`, '移动 10 px'],
    ],
  },
  {
    title: '画布',
    items: [
      [`${mod} 滚轮`, '缩放'],
      [`${mod} 0`, '适应窗口'],
      [`${mod} + / ${mod} -`, '放大 / 缩小'],
      ['空格 拖动 / 中键', '平移'],
      [`拖动时按住 ${alt}`, '临时关闭吸附'],
      [`${shift} 拖动角`, '保持比例缩放'],
      [`${shift} R`, '显示 / 隐藏标尺'],
      ['从标尺拖出', '添加参考线（拖回标尺删除）'],
      ['?', '快捷键说明'],
    ],
  },
]
</script>

<template>
  <el-dialog v-model="visible" title="快捷键" width="680px" append-to-body class="studio-dialog">
    <div class="shortcuts" data-testid="shortcuts">
      <section v-for="group in groups" :key="group.title">
        <h4>{{ group.title }}</h4>
        <div v-for="[key, label] in group.items" :key="label" class="item">
          <span>{{ label }}</span>
          <kbd>{{ key }}</kbd>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<style scoped>
.shortcuts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
h4 {
  margin: 0 0 8px;
  color: var(--s-fg);
  font-size: 12.5px;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--s-line);
  color: var(--s-fg-2);
  font-size: 12px;
}
kbd {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--s-line-2);
  border-radius: 4px;
  background: var(--s-raised);
  color: var(--s-fg);
  font: 11px var(--s-mono);
}
</style>
