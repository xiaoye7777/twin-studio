/*
 * 3D 场景的数据接口和「数据接口」页面（数据服务 + 接口）之间的桥：
 *   - 场景里需要认证的接口只保存 authRef（数据服务的 ID），Token 留在本机，这里按 ID 取出请求头；
 *   - 把已登记的接口复制成场景接口的配置，后端的接口只需要登记（或从 Swagger / YApi 导入）一次。
 */
import { type HttpDataSourceConfig, isSafeHttpUrl, looksLikeSecret } from '@twin-studio/core'
import type { ApiConnection, ApiDataset } from './model'
import { joinUrl } from './request'
import { useDataSourceStore } from './store'

/** 数据服务的认证和公共请求头。 */
export function connectionHeaders(connection: ApiConnection): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const header of connection.headers) if (header.key.trim()) headers[header.key.trim()] = header.value
  const auth = connection.auth
  if (auth.type === 'bearer' && auth.token) headers.Authorization = `Bearer ${auth.token}`
  if (auth.type === 'header' && auth.name.trim()) headers[auth.name.trim()] = auth.value
  return headers
}

/** 给 TwinDataRuntime：场景接口的认证请求头。 */
export async function sceneSourceHeaders(source: HttpDataSourceConfig): Promise<Record<string, string> | undefined> {
  if (!source.authRef) return undefined
  const store = useDataSourceStore()
  await store.load()
  const connection = store.connection(source.authRef)
  return connection ? connectionHeaders(connection) : undefined
}

/** 这个数据服务有没有需要留在本机的认证信息或请求头。 */
export function connectionNeedsAuthRef(connection: ApiConnection): boolean {
  return connection.auth.type === 'bearer' || connection.auth.type === 'header' || connection.headers.length > 0
}

/**
 * 把已登记的接口转成场景接口的配置。复制一份而不是引用：场景文件要能脱离这台电脑独立运行。
 * 地址不合规（如带 Token 的查询串）时返回 null；名字像认证信息的参数不复制。
 */
export function sourceFromDataset(
  dataset: ApiDataset,
  connection: ApiConnection,
): Partial<Omit<HttpDataSourceConfig, 'id' | 'type' | 'enabled'>> | null {
  let path = dataset.path
  for (const param of dataset.params)
    if (param.in === 'path') path = path.replace(`{${param.key}}`, encodeURIComponent(param.default))
  const url = joinUrl(connection.baseUrl, path)
  if (!isSafeHttpUrl(url)) return null
  const publicParams = (place: 'query' | 'header') =>
    dataset.params
      .filter(param => param.in === place && !looksLikeSecret(param.key))
      .map(param => ({ key: param.key, value: param.default }))
  const bodyParams = dataset.params.filter(param => param.in === 'body' && !looksLikeSecret(param.key))
  return {
    name: dataset.name,
    url,
    method: dataset.method === 'GET' ? 'GET' : 'POST',
    params: publicParams('query'),
    headers: publicParams('header'),
    body: bodyParams.length
      ? JSON.stringify(Object.fromEntries(bodyParams.map(param => [param.key, param.default])))
      : undefined,
    resultPath: dataset.resultPath,
    interval: Math.min(3600, Math.max(1, dataset.refresh || 30)),
    timeout: Math.min(120, Math.max(1, connection.timeout)),
    envelope: connection.envelope,
    withCredentials: connection.auth.type === 'cookie',
    authRef: connectionNeedsAuthRef(connection) ? connection.id : undefined,
  }
}
