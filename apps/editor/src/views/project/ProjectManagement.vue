<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { FileUp, Plus, Sparkles } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import CreateProjectDialog from '@/components/project/CreateProjectDialog.vue'
import ProjectCard from '@/components/project/ProjectCard.vue'
import { createZeroCarbonPark } from '@/demo/zeroCarbonPark'
import { IndexedDbAssetRepository } from '@/infrastructure/assets'
import { ProjectPackageService } from '@/infrastructure/packages/ProjectPackageService'
import { LocalSceneRepository } from '@/infrastructure/scenes'
import { type Project, useProjectStore } from '@/stores/project'

const router = useRouter()
const projectStore = useProjectStore()
const dialogVisible = ref(false)
const packageInput = ref<HTMLInputElement>()
const importing = ref(false)
const creatingDemo = ref(false)
const exportingId = ref('')
const scenes = new LocalSceneRepository()
const packages = new ProjectPackageService(scenes, new IndexedDbAssetRepository(), projectStore)

async function createDemo(): Promise<void> {
  if (creatingDemo.value) return
  creatingDemo.value = true
  try {
    const project = await createZeroCarbonPark(projectStore.addImportedProject)
    ElMessage.success('已创建零碳智慧园区示例')
    editProject(project)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建示例失败')
  } finally {
    creatingDemo.value = false
  }
}

async function exportProject(project: Project): Promise<void> {
  if (exportingId.value) return
  exportingId.value = project.id
  try {
    const blob = await packages.exportProject(project)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    // Control characters are deliberately stripped from download file names.
    // eslint-disable-next-line no-control-regex
    link.download = `${project.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100) || 'project'}.twin.zip`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    ElMessage.success('项目包已导出（最近保存的版本）')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目导出失败')
  } finally {
    exportingId.value = ''
  }
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
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目导入失败')
  } finally {
    importing.value = false
  }
}

async function renameProject(project: Project): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('新的项目名称', '重命名', {
      inputValue: project.name,
      inputValidator: text => (text.trim().length >= 2 && text.trim().length <= 40) || '项目名称为 2–40 个字符',
      customClass: 'studio-dialog',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    projectStore.updateProject(project.id, { name: value.trim() })
  } catch {
    // Cancelled.
  }
}

async function removeProject(project: Project): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除「${project.name}」？场景数据将从本机移除，此操作不可撤销。建议先导出项目包备份。`,
      '删除项目',
      {
        type: 'warning',
        customClass: 'studio-dialog',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
    await scenes.remove(project.id)
    projectStore.removeProject(project.id)
  } catch {
    // Cancelled.
  }
}

function editProject(project: Project): void {
  void router.push({ name: 'editor', params: { projectId: project.id } })
}

function openDashboard(project: Project): void {
  void router.push({ name: 'project-dashboard', params: { projectId: project.id } })
}
</script>

<template>
  <section class="projects">
    <header class="projects__head">
      <div>
        <h1>项目</h1>
        <p>搭建园区三维场景，配置设备数据与告警，导出给数据大屏放映</p>
      </div>
      <div class="projects__actions">
        <button class="s-btn" data-testid="create-park-demo" :disabled="creatingDemo" @click="createDemo">
          <Sparkles :size="14" />{{ creatingDemo ? '创建中…' : '零碳园区示例' }}
        </button>
        <button class="s-btn" data-testid="import-project" :disabled="importing" @click="packageInput?.click()">
          <FileUp :size="14" />{{ importing ? '导入中…' : '导入项目包' }}
        </button>
        <button class="s-btn s-btn--primary" data-testid="new-project" @click="dialogVisible = true">
          <Plus :size="14" />新建项目
        </button>
        <input
          ref="packageInput"
          data-testid="project-package-input"
          hidden
          type="file"
          accept=".zip,application/zip"
          @change="importProject"
        />
      </div>
    </header>

    <div v-if="projectStore.projects.length" class="projects__grid">
      <ProjectCard
        v-for="project in [...projectStore.projects].reverse()"
        :key="project.id"
        :project="project"
        :exporting="exportingId === project.id"
        @edit="editProject"
        @dashboard="openDashboard"
        @export="exportProject"
        @rename="renameProject"
        @remove="removeProject"
      />
    </div>
    <div v-else class="projects__empty">
      <Sparkles :size="28" />
      <h2>从零碳园区示例开始</h2>
      <p>示例包含光伏、风电、储能和建筑模型，已配置设备数据、告警规则、能流线和自动导览。</p>
      <div class="projects__actions">
        <button class="s-btn s-btn--primary" @click="createDemo"><Sparkles :size="14" />创建示例</button>
        <button class="s-btn" @click="dialogVisible = true"><Plus :size="14" />新建空白项目</button>
      </div>
    </div>

    <CreateProjectDialog v-model="dialogVisible" @created="editProject" />
  </section>
</template>

<style scoped>
.projects {
  max-width: 1480px;
}
.projects__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.projects__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.projects__head p {
  margin: 4px 0 0;
  color: var(--s-fg-3);
}
.projects__actions {
  display: flex;
  gap: 8px;
}
.projects__actions .s-btn {
  height: 32px;
  padding: 0 14px;
}
.projects__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}
.projects__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 80px 20px;
  border: 1px dashed var(--s-line-2);
  border-radius: 12px;
  color: var(--s-fg-2);
  text-align: center;
}
.projects__empty > svg {
  color: var(--s-accent);
}
.projects__empty h2 {
  margin: 4px 0 0;
  color: var(--s-fg);
  font-size: 16px;
}
.projects__empty p {
  max-width: 440px;
  margin: 0 0 12px;
  color: var(--s-fg-3);
}
</style>
