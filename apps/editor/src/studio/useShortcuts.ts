import { onBeforeUnmount, onMounted, type ShallowRef } from 'vue'
import type { EditorSession } from './EditorSession'
import type { ShellState } from './shell'

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Editor keyboard shortcuts (Unity / Figma conventions). */
export function useStudioShortcuts(session: ShallowRef<EditorSession | null>, shell: ShellState): void {
  const onKeyDown = (event: KeyboardEvent) => {
    const s = session.value
    if (!s?.ui.ready || typing(event.target)) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (s.ui.mode === 'preview') {
      if (key === 'escape' || key === 'p') {
        event.preventDefault()
        s.exitPreview()
      } else if (key === ' ' && s.ui.tour.playing) {
        event.preventDefault()
        if (s.ui.tour.paused) s.tours.resume()
        else s.tours.pause()
      } else if (key === 'arrowright' && s.ui.tour.playing) s.tours.next()
      else if (key === 'arrowleft' && s.ui.tour.playing) s.tours.previous()
      return
    }
    const run = (action: () => void) => {
      event.preventDefault()
      action()
    }
    if (s.ui.draw) {
      if (key === 'escape') return run(() => s.cancelDrawing())
      if (key === 'enter') return run(() => s.finishDrawingNow())
      if (key === 'backspace' || key === 'delete') return run(() => s.undoDrawPoint())
    }
    if (s.ui.measure.mode) {
      if (key === 'escape') return run(() => s.stopMeasure())
      if (key === 'enter') return run(() => s.finishMeasure())
      if (key === 'backspace' || key === 'delete') return run(() => s.undoMeasurePoint())
    }
    if (mod && key === 'z' && event.shiftKey) return run(() => s.redo())
    if (mod && key === 'z') return run(() => s.undo())
    if (mod && key === 'y') return run(() => s.redo())
    if (mod && key === 's') return run(() => void s.save(true))
    if (mod && key === 'd') return run(() => s.duplicateSelection())
    if (mod && key === 'c') return run(() => s.copySelection())
    if (mod && key === 'v') return run(() => s.paste())
    if (mod && key === 'a') return run(() => s.selectAll())
    if (mod && key === 'g' && event.shiftKey) return run(() => s.ungroupSelection())
    if (mod && key === 'g') return run(() => void s.groupSelection())
    if (mod) return
    switch (key) {
      case 'q':
        return run(() => s.setTool('select'))
      case 'w':
        return run(() => s.setTool('translate'))
      case 'e':
        return run(() => s.setTool('rotate'))
      case 'r':
        return run(() => s.setTool('scale'))
      case 'f':
        return run(() => void s.focusSelection())
      case 'h':
        return run(() => s.toggleVisibilityOfSelection())
      case 'delete':
      case 'backspace':
        return run(() => s.deleteSelection())
      case 'escape':
        return run(() => s.selectParent())
      case 'end':
        return run(() => s.dropToGround())
      case 'p':
        return run(() => s.enterPreview())
      case 'm':
        return run(() => (s.ui.measure.mode ? s.stopMeasure() : s.startMeasure('distance')))
      case '7':
        return run(() => void s.viewFrom('top'))
      case '1':
        return run(() => void s.viewFrom('front'))
      case '3':
        return run(() => void s.viewFrom('right'))
      case '0':
        return run(() => void s.viewFrom('perspective'))
      case '?':
        return run(() => (shell.dialog = 'shortcuts'))
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
}
