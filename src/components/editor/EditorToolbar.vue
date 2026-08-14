<script setup lang="ts">
import { ArrowLeft, Aim, Promotion, Rank, RefreshRight, Select, Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

defineProps<{
  projectName: string
}>()

defineEmits<{
  back: []
}>()

function showDemoMessage(action: string) {
  ElMessage.info(`${action}功能将在后续版本中接入`)
}
</script>

<template>
  <header class="flex h-12 shrink-0 items-center border-b border-slate-700 bg-slate-900 px-3 text-slate-200">
    <div class="flex w-[320px] items-center gap-2">
      <el-tooltip content="返回项目管理" placement="bottom">
        <button class="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-slate-700" type="button" @click="$emit('back')">
          <el-icon><ArrowLeft /></el-icon>
        </button>
      </el-tooltip>
      <span class="h-5 w-px bg-slate-700" />
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-white">{{ projectName }}</p>
        <p class="text-[10px] text-slate-500">场景编辑器</p>
      </div>
    </div>

    <div class="flex flex-1 items-center justify-center gap-1">
      <el-tooltip v-for="tool in [
        { name: '选择', icon: Select },
        { name: '移动', icon: Rank },
        { name: '旋转', icon: RefreshRight },
        { name: '缩放', icon: Aim },
      ]" :key="tool.name" :content="tool.name" placement="bottom">
        <button class="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-700 hover:text-white" type="button">
          <el-icon><component :is="tool.icon" /></el-icon>
        </button>
      </el-tooltip>
    </div>

    <div class="flex w-[320px] items-center justify-end gap-2">
      <el-button size="small" dark @click="showDemoMessage('保存')">保存</el-button>
      <el-button size="small" dark @click="showDemoMessage('预览')">
        <el-icon class="mr-1"><Promotion /></el-icon>预览
      </el-button>
      <el-button size="small" type="primary" @click="showDemoMessage('发布')">
        <el-icon class="mr-1"><Upload /></el-icon>发布
      </el-button>
    </div>
  </header>
</template>
