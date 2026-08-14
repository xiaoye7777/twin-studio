<script setup lang="ts">
import { reactive, ref } from 'vue'
import { DataAnalysis, Lock, User } from '@element-plus/icons-vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useRouter } from 'vue-router'

const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ username: 'demo', password: 'demo123' })

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function login() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  window.setTimeout(() => {
    ElMessage.success('登录成功')
    loading.value = false
    router.push('/projects')
  }, 450)
}
</script>

<template>
  <main class="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-6 py-10">
    <div class="absolute -left-24 top-24 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl" />
    <div class="absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-indigo-200/40 blur-3xl" />

    <section class="relative w-full max-w-[420px] rounded-2xl border border-white/70 bg-white p-8 shadow-xl shadow-slate-300/40">
      <div class="mb-8 text-center">
        <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
          <el-icon :size="24"><DataAnalysis /></el-icon>
        </span>
        <h1 class="mt-4 text-xl font-semibold tracking-tight text-slate-900">数字孪生平台</h1>
        <p class="mt-2 text-sm text-slate-400">登录 Digital Twin Studio 工作台</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="login">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" size="large" placeholder="请输入用户名" :prefix-icon="User" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            size="large"
            type="password"
            placeholder="请输入密码"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="login"
          />
        </el-form-item>
        <el-button class="mt-2 w-full" type="primary" size="large" :loading="loading" @click="login">
          登录
        </el-button>
      </el-form>

      <p class="mt-6 text-center text-xs text-slate-400">Demo 环境 · 任意用户名和密码均可登录</p>
    </section>
  </main>
</template>
