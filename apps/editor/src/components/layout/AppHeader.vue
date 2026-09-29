<script setup lang="ts">
import { ArrowDown, DataAnalysis, User } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

const router = useRouter()

function handleCommand(command: string) {
  if (command === 'login') router.push('/login')
}
</script>

<template>
  <header
    class="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white px-6"
  >
    <div class="flex items-center gap-3">
      <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
        <el-icon :size="20"><DataAnalysis /></el-icon>
      </span>
      <div>
        <div class="text-[15px] font-semibold tracking-tight text-slate-900">Digital Twin Studio</div>
        <div class="text-[11px] text-slate-400">低代码数字孪生平台</div>
      </div>
    </div>

    <el-dropdown trigger="click" @command="handleCommand">
      <button
        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
        type="button"
      >
        <el-avatar :size="32" class="bg-slate-700">
          <el-icon><User /></el-icon>
        </el-avatar>
        <span>演示用户</span>
        <el-icon :size="12"><ArrowDown /></el-icon>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="login">登录</el-dropdown-item>
          <el-dropdown-item disabled>个人中心</el-dropdown-item>
          <el-dropdown-item disabled divided>退出登录</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </header>
</template>
