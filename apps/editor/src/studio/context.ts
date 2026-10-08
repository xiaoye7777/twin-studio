import { inject, type InjectionKey, type ShallowRef } from 'vue'
import type { EditorSession } from './EditorSession'

export const SessionKey: InjectionKey<ShallowRef<EditorSession | null>> = Symbol('editor-session')

/** The open session. Studio panels render only once it exists, so this never returns null there. */
export function useSession(): EditorSession {
  const session = inject(SessionKey)?.value
  if (!session) throw new Error('useSession() called outside an open editor session')
  return session
}

/** Kind labels and colours shared by the tree, inspector and status bar. */
export const nodeKindLabels: Record<string, string> = {
  model: '模型',
  primitive: '基本体',
  group: '分组',
  path: '能流线',
  area: '区域',
  label: '标签',
  light: '灯光',
}
