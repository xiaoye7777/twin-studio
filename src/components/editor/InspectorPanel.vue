<script setup lang="ts">
import { reactive } from 'vue'

interface Vector3Value {
  x: number
  y: number
  z: number
}

const transform = reactive<{
  position: Vector3Value
  rotation: Vector3Value
  scale: Vector3Value
}>({
  position: { x: 0, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
})

const fields: Array<{ key: keyof typeof transform; label: string }> = [
  { key: 'position', label: 'Position' },
  { key: 'rotation', label: 'Rotation' },
  { key: 'scale', label: 'Scale' },
]
</script>

<template>
  <aside class="w-[280px] shrink-0 border-l border-slate-700 bg-slate-800 text-slate-300">
    <div class="flex h-10 items-center border-b border-slate-700 px-4 text-xs font-semibold text-slate-200">属性</div>
    <div class="space-y-5 p-4">
      <label class="block">
        <span class="mb-2 block text-xs text-slate-400">名称</span>
        <el-input model-value="Demo Cube" size="small" />
      </label>

      <div v-for="field in fields" :key="field.key">
        <p class="mb-2 text-xs font-medium text-slate-300">{{ field.label }}</p>
        <div class="grid grid-cols-3 gap-1.5">
          <label v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" class="min-w-0">
            <span class="mb-1 block text-[10px] font-medium uppercase text-slate-500">{{ axis }}</span>
            <el-input-number
              v-model="transform[field.key][axis]"
              :controls="false"
              :step="0.1"
              size="small"
              class="w-full!"
            />
          </label>
        </div>
      </div>
    </div>
  </aside>
</template>
