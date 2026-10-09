import { inject, type InjectionKey, reactive, watch } from 'vue'

export type StudioDialog = 'shortcuts' | 'batch-bind' | 'array' | 'replace-model' | 'history' | 'performance' | null

const LAYOUT_KEY = 'twin-studio:editor-layout'

/** Panel sizes the user dragged, remembered per browser. */
export const panelLimits = {
  left: { min: 200, max: 480, initial: 264 },
  right: { min: 280, max: 520, initial: 316 },
  dock: { min: 140, max: 420, initial: 176 },
} as const

function savedLayout(): { left: number; right: number; dock: number; dockOpen: boolean } {
  const fallback = {
    left: panelLimits.left.initial,
    right: panelLimits.right.initial,
    dock: panelLimits.dock.initial,
    dockOpen: true,
  }
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') }
  } catch {
    return fallback
  }
}

/** Layout and dialog state of the editor window (not part of the document). */
export function createShellState() {
  const layout = savedLayout()
  const shell = reactive({
    dialog: null as StudioDialog,
    dockOpen: layout.dockOpen,
    leftWidth: layout.left,
    rightWidth: layout.right,
    dockHeight: layout.dock,
    leftTab: 'scene' as 'scene' | 'assets',
    sceneTab: 'environment' as 'environment' | 'data' | 'presentation',
    nodeTab: 'properties' as 'properties' | 'data' | 'effects' | 'interactions',
    renaming: null as string | null,
  })
  watch(
    () => [shell.leftWidth, shell.rightWidth, shell.dockHeight, shell.dockOpen] as const,
    ([left, right, dock, dockOpen]) => {
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({ left, right, dock, dockOpen }))
      } catch {
        // Layout memory is a convenience.
      }
    },
  )
  return shell
}

export type ShellState = ReturnType<typeof createShellState>
export const ShellKey: InjectionKey<ShellState> = Symbol('studio-shell')

export function useShell(): ShellState {
  const shell = inject(ShellKey)
  if (!shell) throw new Error('useShell() called outside the studio')
  return shell
}
