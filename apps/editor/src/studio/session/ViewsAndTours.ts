import { type CameraBookmark, newId, type SceneDocumentV2, type Tour, type TourStep } from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

/**
 * 视角（书签）、导览和放映设置。视角存相机位置和缩略图；导览由若干步骤组成，每步飞到一个视角并显示字幕。
 * 播放由 session.tours（core 的 TourPlayer）负责，这里只编辑。
 */
export class ViewsAndTours {
  constructor(private readonly session: EditorSession) {}

  async addBookmark(name?: string): Promise<string> {
    const view = this.session.engine.rig.getView()
    const thumbnail = (await this.session.captureClean(240)) ?? undefined
    const bookmark: CameraBookmark = {
      id: newId('view'),
      name: name || `视角 ${this.session.doc.value.bookmarks.length + 1}`,
      view,
      ...(thumbnail ? { thumbnail } : {}),
    }
    this.session.edit('保存视角', draft => void draft.bookmarks.push(bookmark))
    return bookmark.id
  }

  async updateBookmarkView(id: string): Promise<void> {
    const view = this.session.engine.rig.getView()
    const thumbnail = (await this.session.captureClean(240)) ?? undefined
    this.session.edit('更新视角', draft => {
      const bookmark = draft.bookmarks.find(item => item.id === id)
      if (!bookmark) return
      bookmark.view = view
      if (thumbnail) bookmark.thumbnail = thumbnail
    })
  }

  renameBookmark(id: string, name: string): void {
    this.session.edit('重命名视角', draft => {
      const bookmark = draft.bookmarks.find(item => item.id === id)
      if (bookmark && name.trim()) bookmark.name = name.trim()
    })
  }

  removeBookmark(id: string): void {
    this.session.edit('删除视角', draft => {
      draft.bookmarks = draft.bookmarks.filter(item => item.id !== id)
      for (const tour of draft.tours) for (const step of tour.steps) if (step.bookmarkId === id) step.bookmarkId = null
    })
  }

  flyToBookmark(id: string): Promise<boolean> {
    const bookmark = this.session.doc.value.bookmarks.find(item => item.id === id)
    return bookmark ? this.session.engine.flyTo(bookmark.view, 1.2) : Promise.resolve(false)
  }

  /** The project opens with the current camera view. */
  setOpeningView(): void {
    const view = this.session.engine.rig.getView()
    this.session.edit('设为初始视角', draft => void (draft.cameraView = view))
  }

  addTour(fromBookmarks = false): string {
    const tour: Tour = {
      id: newId('tour'),
      name: `导览 ${this.session.doc.value.tours.length + 1}`,
      loop: true,
      steps: fromBookmarks
        ? this.session.doc.value.bookmarks.map(bookmark =>
            createStep({ bookmarkId: bookmark.id, caption: bookmark.name }),
          )
        : [],
    }
    this.session.edit('新建导览', draft => void draft.tours.push(tour))
    return tour.id
  }

  updateTour(id: string, recipe: (tour: Tour) => void, coalesceKey?: string): void {
    this.session.edit(
      '修改导览',
      draft => {
        const tour = draft.tours.find(item => item.id === id)
        if (tour) recipe(tour)
      },
      { coalesceKey },
    )
  }

  removeTour(id: string): void {
    this.session.edit('删除导览', draft => {
      draft.tours = draft.tours.filter(item => item.id !== id)
      if (draft.presentation.autoplayTourId === id) draft.presentation.autoplayTourId = null
    })
  }

  addTourStep(tourId: string, patch: Partial<TourStep> = {}): void {
    this.updateTour(tourId, tour => void tour.steps.push(createStep(patch)))
  }

  updatePresentation(recipe: (presentation: SceneDocumentV2['presentation']) => void, coalesceKey?: string): void {
    this.session.edit('放映设置', draft => recipe(draft.presentation), { coalesceKey })
  }

  playTour(id: string, from = 0): void {
    this.session.clearSelection()
    void this.session.tours.play(id, from)
  }

  stopTour(): void {
    this.session.tours.stop()
  }
}

function createStep(patch: Partial<TourStep> = {}): TourStep {
  return {
    id: newId('step'),
    bookmarkId: null,
    nodeId: null,
    duration: 2.5,
    hold: 4,
    caption: '',
    show: [],
    hide: [],
    highlightNodeId: null,
    ...patch,
  }
}
