<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { createScreenDocument, pagePresets, type ScreenDocument } from '../model'
import { useScreenStore } from '../storage/screens'
import { buildTemplate, templates } from '../templates'

const visible = defineModel<boolean>({ required: true })
const emit = defineEmits<{ created: [screen: ScreenDocument] }>()
const projects = useProjectStore()
const screens = useScreenStore()
const form = reactive({ name: '', preset: '1920x1080', template: 'park', sceneProjectId: '' })
const busy = reactive({ value: false })

const sceneOptions = computed(() => [...projects.projects].reverse())
const template = computed(() => templates.find(item => item.id === form.template)!)

watch(visible, open => {
  if (!open) return
  form.name = ''
  form.template = 'park'
  form.sceneProjectId = sceneOptions.value[0]?.id ?? ''
})

async function create(): Promise<void> {
  const name = form.name.trim() || template.value.defaultName
  const preset = pagePresets.find(item => item.id === form.preset)!
  busy.value = true
  try {
    const base = createScreenDocument(name, preset.width, preset.height)
    base.sceneProjectId = form.sceneProjectId || null
    const screen = await buildTemplate(form.template, base)
    await screens.save(screen)
    visible.value = false
    emit('created', screen)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="新建数据大屏" width="520px" append-to-body class="studio-dialog">
    <div class="form">
      <label>模板</label>
      <div class="templates">
        <button
          v-for="item in templates"
          :key="item.id"
          class="template"
          :class="{ 'is-active': form.template === item.id }"
          :data-testid="`screen-template-${item.id}`"
          @click="form.template = item.id"
        >
          <strong>{{ item.name }}</strong>
          <span>{{ item.description }}</span>
        </button>
      </div>
      <label>名称</label>
      <input v-model="form.name" class="s-input" :placeholder="template.defaultName" data-testid="screen-name" />
      <label>画布尺寸</label>
      <select v-model="form.preset" class="s-select">
        <option v-for="preset in pagePresets" :key="preset.id" :value="preset.id">{{ preset.label }}</option>
      </select>
      <label>关联三维场景</label>
      <select v-model="form.sceneProjectId" class="s-select" data-testid="screen-scene">
        <option value="">不关联（只用静态数据）</option>
        <option v-for="project in sceneOptions" :key="project.id" :value="project.id">{{ project.name }}</option>
      </select>
    </div>
    <p class="hint">
      关联三维场景后，大屏可以放入三维视图、读取场景中设备的实时数据，并与三维场景双向联动。之后也可以在页面设置中更换。
    </p>
    <template #footer>
      <button class="s-btn" @click="visible = false">取消</button>
      <button class="s-btn s-btn--primary" :disabled="busy.value" data-testid="screen-create" @click="create">
        {{ busy.value ? '创建中…' : '创建' }}
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form {
  display: grid;
  grid-template-columns: 96px 1fr;
  align-items: center;
  gap: 12px;
}
.form label {
  align-self: start;
  padding-top: 7px;
  color: var(--s-fg-3);
  font-size: 12px;
}
.templates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.template {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--s-line);
  border-radius: 8px;
  background: var(--s-panel-2);
  color: var(--s-fg-2);
  text-align: left;
  cursor: pointer;
}
.template strong {
  color: var(--s-fg);
  font-size: 13px;
  font-weight: 550;
}
.template span {
  font-size: 11.5px;
  line-height: 1.5;
}
.template.is-active {
  border-color: var(--s-accent);
  background: var(--s-accent-soft);
}
.hint {
  margin: 14px 0 0;
  color: var(--s-fg-3);
  font-size: 12px;
  line-height: 1.6;
}
</style>
