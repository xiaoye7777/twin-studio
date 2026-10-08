<script setup lang="ts">
import { ref, watch } from 'vue'
import { useProjectStore, type Project } from '@/stores/project'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [project: Project] }>()
const projectStore = useProjectStore()
const name = ref('')
const error = ref('')
watch(
  () => props.modelValue,
  open => {
    if (open) {
      name.value = ''
      error.value = ''
    }
  },
)
function submit(): void {
  const value = name.value.trim()
  if (value.length < 2 || value.length > 40) {
    error.value = '项目名称为 2–40 个字符'
    return
  }
  const project = projectStore.createProject(value)
  emit('update:modelValue', false)
  emit('created', project)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="新建项目"
    width="420px"
    append-to-body
    class="studio-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <label class="field">
      <span>项目名称</span>
      <input
        v-model="name"
        class="s-input"
        maxlength="40"
        placeholder="例如：深圳储能产业园"
        autofocus
        data-testid="project-name-input"
        @keydown.enter.prevent="submit"
      />
      <small v-if="error" class="field__error">{{ error }}</small>
    </label>
    <template #footer>
      <button class="s-btn" @click="emit('update:modelValue', false)">取消</button>
      <button class="s-btn s-btn--primary" data-testid="project-create" @click="submit">创建并打开</button>
    </template>
  </el-dialog>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #a9a6a0;
  font-size: 12px;
}
.field .s-input {
  height: 32px;
  font-size: 13px;
}
.field__error {
  color: #e5675c;
}
</style>
