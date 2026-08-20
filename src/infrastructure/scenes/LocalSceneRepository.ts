import { isSceneDocumentV1 } from '@/domain/scene'
import type { SceneDocumentV1 } from '@/domain/scene'
import type { SceneRepository } from './SceneRepository'

const STORAGE_PREFIX = 'digital-twin-studio:scene:v1:'

export class SceneDocumentError extends Error {}

export class LocalSceneRepository implements SceneRepository {
  async save(document: SceneDocumentV1): Promise<void> {
    localStorage.setItem(this.key(document.projectId), JSON.stringify(document))
  }

  async load(projectId: string): Promise<SceneDocumentV1 | null> {
    const serialized = localStorage.getItem(this.key(projectId))
    if (!serialized) return null

    let value: unknown
    try {
      value = JSON.parse(serialized)
    } catch {
      throw new SceneDocumentError('本地场景数据不是有效 JSON')
    }
    if (!isSceneDocumentV1(value)) {
      throw new SceneDocumentError('本地场景数据损坏或版本不受支持')
    }
    if (value.projectId !== projectId) {
      throw new SceneDocumentError('本地场景与当前项目不匹配')
    }
    return value
  }

  private key(projectId: string): string {
    return `${STORAGE_PREFIX}${projectId}`
  }
}
