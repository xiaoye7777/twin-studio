<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import CreateProjectDialog from '@/components/project/CreateProjectDialog.vue'
import ProjectCard from '@/components/project/ProjectCard.vue'
import { useProjectStore, type Project } from '@/stores/project'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { ProjectPackageService } from '@/infrastructure/packages/ProjectPackageService'
import { createZeroCarbonPark } from '@/demo/zeroCarbonPark'

const router = useRouter()
const projectStore = useProjectStore()
const dialogVisible = ref(false)
const packageInput = ref<HTMLInputElement>()
const importing = ref(false)
const creatingDemo = ref(false)
async function createDemo(): Promise<void> {
  if (creatingDemo.value) return
  creatingDemo.value = true
  try {
    await createZeroCarbonPark(projectStore.addImportedProject)
    ElMessage.success('零碳智慧园区 Demo 已创建，可从项目卡片进入编辑器或数据大屏；再次创建将生成独立副本。')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '创建示例失败') }
  finally { creatingDemo.value = false }
}
const exportingId = ref('')
const packages = new ProjectPackageService(new LocalSceneRepository(), new IndexedDbAssetRepository(), projectStore)

async function exportProject(project: Project): Promise<void> {
  if (exportingId.value) return
  exportingId.value = project.id
  try {
    const blob = await packages.exportProject(project)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100) || 'project'}.twin.zip`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    ElMessage.success('项目包已导出（当前已保存版本）')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '项目导出失败') }
  finally { exportingId.value = '' }
}

async function importProject(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importing.value) return
  importing.value = true
  try {
    const project = await packages.importProject(file)
    ElMessage.success(`已导入：${project.name}`)
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '项目导入失败') }
  finally { importing.value = false }
}

function editProject(project: Project) {
  void router.push({ name: 'editor', params: { projectId: project.id } })
}

function openDashboard(project: Project) {
  void router.push({ name: 'project-dashboard', params: { projectId: project.id } })
}
</script>

<template>
  <section class="mx-auto max-w-[1560px]">
    <div class="mb-8 flex items-end justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900">项目管理</h1>
        <p class="mt-2 text-sm text-slate-500">创建和管理数字孪生项目</p>
      </div>
      <div class="flex items-center gap-4">
        <p class="text-sm text-slate-400">共 {{ projectStore.projectCount }} 个项目</p>
        <el-button data-testid="create-park-demo" :loading="creatingDemo" @click="createDemo">创建园区示例</el-button>
        <el-button data-testid="import-project" :loading="importing" @click="packageInput?.click()">导入项目</el-button>
        <input ref="packageInput" data-testid="project-package-input" class="hidden" type="file" accept=".zip,application/zip" @change="importProject" />
      </div>
    </div>

    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <ProjectCard
        v-for="project in projectStore.projects"
        :key="project.id"
        :project="project"
        :exporting="!!exportingId"
        @edit="editProject"
        @dashboard="openDashboard"
        @export="exportProject"
      />

      <button
        class="group flex min-h-[264px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/55 text-slate-400 transition duration-200 hover:-translate-y-1 hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-600 hover:shadow-lg hover:shadow-blue-100/50"
        type="button"
        @click="dialogVisible = true"
      >
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 transition group-hover:bg-blue-100">
          <el-icon :size="23"><Plus /></el-icon>
        </span>
        <span class="mt-4 text-sm font-medium">创建项目</span>
        <span class="mt-1.5 text-xs text-slate-400">从空白场景开始</span>
      </button>
    </div>

    <CreateProjectDialog v-model="dialogVisible" @created="editProject" />
  </section>
</template>
