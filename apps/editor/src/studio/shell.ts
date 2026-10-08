import { inject, type InjectionKey, reactive } from 'vue'

export type StudioDialog = 'shortcuts' | 'batch-bind' | 'array' | null

/** Layout and dialog state of the editor window (not part of the document). */
export function createShellState() {
  return reactive({
    dialog: null as StudioDialog,
    dockOpen: true,
    leftTab: 'scene' as 'scene' | 'assets',
    sceneTab: 'environment' as 'environment' | 'data' | 'presentation',
    nodeTab: 'properties' as 'properties' | 'data' | 'effects' | 'interactions',
    renaming: null as string | null,
  })
}

export type ShellState = ReturnType<typeof createShellState>
export const ShellKey: InjectionKey<ShellState> = Symbol('studio-shell')

export function useShell(): ShellState {
  const shell = inject(ShellKey)
  if (!shell) throw new Error('useShell() called outside the studio')
  return shell
}
