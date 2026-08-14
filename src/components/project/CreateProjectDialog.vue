<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useProjectStore, type Project } from '@/stores/project'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [project: Project]
}>()

const projectStore = useProjectStore()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({ name: '' })

const rules: FormRules<typeof form> = {
  name: [
    { required: true, message: '请输入项目名称', trigger: 'blur' },
    { min: 2, max: 40, message: '项目名称长度为 2–40 个字符', trigger: 'blur' },
  ],
}

function closeDialog() {
  emit('update:modelValue', false)
}

function resetForm() {
  form.name = ''
  nextTick(() => formRef.value?.clearValidate())
}

async function submit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  const project = projectStore.createProject(form.name)
  ElMessage.success('项目创建成功')
  submitting.value = false
  emit('created', project)
  closeDialog()
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    title="创建项目"
    width="480px"
    destroy-on-close
    @close="closeDialog"
    @closed="resetForm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item label="项目名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="请输入项目名称"
          maxlength="40"
          show-word-limit
          autofocus
          @keyup.enter="submit"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">创建</el-button>
      </div>
    </template>
  </el-dialog>
</template>
