import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export interface Project {
  id: string
  name: string
  cover?: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'digital-twin-studio-projects'

const starterProjects: Project[] = [
  {
    id: 'shenzhen-energy-park',
    name: '深圳储能产业园',
    cover: 'linear-gradient(135deg, #dcecff 0%, #9fc5f8 52%, #597ca8 100%)',
    createdAt: '2026-08-06T06:30:00.000Z',
    updatedAt: '2026-08-13T08:20:00.000Z',
  },
  {
    id: 'east-china-data-center',
    name: '华东数据中心',
    cover: 'linear-gradient(135deg, #dff6ef 0%, #91cdbb 52%, #527f77 100%)',
    createdAt: '2026-08-02T03:15:00.000Z',
    updatedAt: '2026-08-12T02:40:00.000Z',
  },
  {
    id: 'smart-manufacturing-line',
    name: '智能制造产线',
    cover: 'linear-gradient(135deg, #efe7ff 0%, #b9a1e8 52%, #75639f 100%)',
    createdAt: '2026-07-25T09:00:00.000Z',
    updatedAt: '2026-08-10T10:10:00.000Z',
  },
]

function loadProjects(): Project[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return starterProjects
    const parsed: unknown = JSON.parse(saved)
    return Array.isArray(parsed) ? (parsed as Project[]) : starterProjects
  } catch {
    return starterProjects
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>(loadProjects())

  const projectCount = computed(() => projects.value.length)

  function createProject(name: string): Project {
    const timestamp = new Date().toISOString()
    const project: Project = {
      id: createId(),
      name: name.trim(),
      cover: 'linear-gradient(135deg, #e6f0ff 0%, #a8c8f0 52%, #6483aa 100%)',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    projects.value.push(project)
    return project
  }

  function getProjectById(id: string) {
    return projects.value.find((project) => project.id === id)
  }

  watch(
    projects,
    (value) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    },
    { deep: true },
  )

  return { projects, projectCount, createProject, getProjectById }
})
