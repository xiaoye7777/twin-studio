import router from '@/router'

/** 在新标签页打开「数据接口」页面（带上接口 id 时直接打开它的编辑框）。 */
export function openDataSourceCenter(datasetId?: string): void {
  const target = router.resolve({ name: 'datasources', query: datasetId ? { dataset: datasetId } : {} })
  window.open(target.href, '_blank')
}
