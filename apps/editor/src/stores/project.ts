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

/** New installs start empty; the project page offers the zero-carbon park sample. */
const starterProjects: Project[] = []

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
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    projects.value.push(project)
    return project
  }

  function getProjectById(id: string) {
    return projects.value.find(project => project.id === id)
  }

  function addImportedProject(project: Project): void {
    if (getProjectById(project.id)) throw new Error('导入项目 ID 已存在')
    const next = [...projects.value, project]
    // Persist before publishing the card, so quota failures can roll back the import.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    projects.value = next
  }

  watch(
    projects,
    value => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    },
    { deep: true },
  )

  function updateProject(id: string, patch: Partial<Omit<Project, 'id'>>): void {
    const project = getProjectById(id)
    if (project) Object.assign(project, patch, { updatedAt: new Date().toISOString() })
  }

  function removeProject(id: string): void {
    projects.value = projects.value.filter(project => project.id !== id)
  }

  return { projects, projectCount, createProject, getProjectById, addImportedProject, updateProject, removeProject }
})
