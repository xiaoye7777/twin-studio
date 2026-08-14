<script setup lang="ts">
import { Box, FolderOpened } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <aside class="fixed bottom-0 left-0 top-16 w-56 border-r border-slate-200/80 bg-white px-3 py-5">
    <p class="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">工作台</p>
    <el-menu
      :default-active="route.path"
      router
      class="border-r-0! bg-transparent!"
    >
      <el-menu-item index="/projects" class="mb-1 rounded-lg!">
        <el-icon><FolderOpened /></el-icon>
        <span>项目管理</span>
      </el-menu-item>
      <el-menu-item index="/assets" class="rounded-lg!">
        <el-icon><Box /></el-icon>
        <span>资产管理</span>
      </el-menu-item>
    </el-menu>

    <div class="absolute bottom-5 left-4 right-4 rounded-xl bg-slate-50 p-3">
      <p class="text-xs font-medium text-slate-600">平台版本</p>
      <p class="mt-1 text-[11px] text-slate-400">Demo · v0.1.0</p>
    </div>
  </aside>
</template>
