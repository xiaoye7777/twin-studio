import { loadSceneDocument, SceneDocumentError, type SceneDocument, type SceneRepository } from '@twin-studio/core'

const STORAGE_PREFIX = 'digital-twin-studio:scene:v1:'

export { SceneDocumentError }

export class LocalSceneRepository implements SceneRepository {
  async remove(projectId: string): Promise<void> {
    localStorage.removeItem(this.key(projectId))
  }

  async save(document: SceneDocument): Promise<void> {
    localStorage.setItem(this.key(document.projectId), JSON.stringify(document))
  }

  async load(projectId: string): Promise<SceneDocument | null> {
    const serialized = localStorage.getItem(this.key(projectId))
    if (!serialized) return null

    let value: unknown
    try {
      value = JSON.parse(serialized)
    } catch {
      throw new SceneDocumentError('本地场景数据不是有效 JSON')
    }
    // Upgrades scenes saved by older builds and reports exactly what is wrong otherwise.
    const { document } = loadSceneDocument(value)
    if (document.projectId !== projectId) {
      throw new SceneDocumentError('本地场景与当前项目不匹配')
    }
    return document
  }

  private key(projectId: string): string {
    return `${STORAGE_PREFIX}${projectId}`
  }
}
