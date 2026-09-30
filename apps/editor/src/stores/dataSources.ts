import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { defaultDataSources, isProjectDataSources, type ProjectDataSource } from '@twin-studio/core'

export const useDataSourcesStore = defineStore('data-sources', () => {
  const sources = shallowRef<ProjectDataSource[]>(defaultDataSources())
  let commit: ((before: ProjectDataSource[], after: ProjectDataSource[]) => void) | null = null
  function replace(next: ProjectDataSource[]) {
    sources.value = next.map(source => ({ ...source }))
  }
  function configure(fn: typeof commit) {
    commit = fn
  }
  function update(next: ProjectDataSource[]) {
    if (!isProjectDataSources(next)) throw new Error('请输入名称和有效 ws:// 或 wss:// 地址（不可含用户名密码）')
    if (!commit) throw new Error('场景尚未就绪')
    commit(
      sources.value.map(source => ({ ...source })),
      next.map(source => ({ ...source })),
    )
  }
  return { sources, replace, configure, update }
})
