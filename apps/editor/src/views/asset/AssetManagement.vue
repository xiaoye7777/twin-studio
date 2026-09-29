<script setup lang="ts">
import { Box, Brush, Picture, Upload } from '@element-plus/icons-vue'

const categories = [
  { title: '3D 模型', description: '建筑、设备与场景模型', icon: Box, count: 0, color: 'bg-blue-50 text-blue-600' },
  { title: '材质', description: 'PBR 材质与材质预设', icon: Brush, count: 0, color: 'bg-emerald-50 text-emerald-600' },
  { title: '贴图', description: '颜色、法线与环境贴图', icon: Picture, count: 0, color: 'bg-violet-50 text-violet-600' },
]
</script>

<template>
  <section class="mx-auto max-w-[1560px]">
    <div class="mb-8 flex items-end justify-between gap-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900">资产管理</h1>
        <p class="mt-2 text-sm text-slate-500">管理数字孪生平台中的模型、材质、贴图等三维资产</p>
      </div>
      <el-button type="primary" disabled>
        <el-icon class="mr-1.5"><Upload /></el-icon>
        上传资产
      </el-button>
    </div>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <article
        v-for="category in categories"
        :key="category.title"
        class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div class="flex items-start justify-between">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl" :class="category.color">
            <el-icon :size="21"><component :is="category.icon" /></el-icon>
          </span>
          <span class="text-2xl font-semibold text-slate-300">{{ category.count }}</span>
        </div>
        <h2 class="mt-5 font-semibold text-slate-800">{{ category.title }}</h2>
        <p class="mt-1 text-sm text-slate-400">{{ category.description }}</p>
      </article>
    </div>

    <div class="mt-6 flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <el-icon :size="26"><Box /></el-icon>
      </span>
      <h2 class="mt-4 text-base font-medium text-slate-700">暂无资产</h2>
      <p class="mt-1.5 text-sm text-slate-400">后续可在这里上传和管理三维资产</p>
      <el-button class="mt-5" disabled>上传第一个资产</el-button>
    </div>
  </section>
</template>
