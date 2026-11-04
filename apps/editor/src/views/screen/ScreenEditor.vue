<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import EditorWorkspace from '@/screen/editor/EditorWorkspace.vue'
import { ScreenEditorSession } from '@/screen/editor/session'
import { screenRepository } from '@/screen/storage/ScreenRepository'
import '@/screen/widgets'
import '@/studio/studio.css'

const route = useRoute()
const router = useRouter()
const session = shallowRef<ScreenEditorSession | null>(null)
const error = ref('')

onMounted(async () => {
  const document = await screenRepository.get(String(route.params.screenId))
  if (!document) {
    error.value = '找不到这个数据大屏，可能已被删除'
    return
  }
  session.value = new ScreenEditorSession(document)
  if (import.meta.env.DEV) (window as unknown as { __screen?: ScreenEditorSession }).__screen = session.value
  window.document.title = `${document.name} · 大屏编辑器`
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

// Leaving saves the screen with a fresh list thumbnail (bounded, so navigation never hangs).
onBeforeRouteLeave(async () => {
  const s = session.value
  if (s) await Promise.race([s.leave(), new Promise(resolve => setTimeout(resolve, 2500))])
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  session.value?.dispose()
})

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function onKeyDown(event: KeyboardEvent): void {
  const s = session.value
  if (!s || typing(event.target)) return
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  const run = (action: () => void) => {
    event.preventDefault()
    action()
  }
  if (mod && key === 'z' && event.shiftKey) return run(() => s.redo())
  if (mod && key === 'z') return run(() => s.undo())
  if (mod && key === 'y') return run(() => s.redo())
  if (mod && key === 's') return run(() => void s.save())
  if (mod && key === 'c') return run(() => s.copy())
  if (mod && key === 'v') return run(() => s.paste())
  if (mod && key === 'd') return run(() => s.duplicateSelected())
  if (mod && key === 'a') return run(() => s.selectAll())
  if (mod && key === 'g' && event.shiftKey) return run(() => s.ungroupSelected())
  if (mod && key === 'g') return run(() => s.groupSelected())
  if (mod && key === '0') return run(() => s.fit())
  if (mod && (key === '=' || key === '+')) return run(() => s.zoomTo(s.ui.zoom * 1.2))
  if (mod && key === '-') return run(() => s.zoomTo(s.ui.zoom / 1.2))
  if (mod) return
  const step = event.shiftKey ? 10 : 1
  if (key === 'arrowleft') return run(() => s.nudge(-step, 0))
  if (key === 'arrowright') return run(() => s.nudge(step, 0))
  if (key === 'arrowup') return run(() => s.nudge(0, -step))
  if (key === 'arrowdown') return run(() => s.nudge(0, step))
  if (key === 'delete' || key === 'backspace') return run(() => s.removeSelected())
  if (key === 'escape') return run(() => s.clearSelection())
  if (key === 'r' && event.shiftKey) return run(() => s.toggleRulers())
  if (event.key === '?') return run(() => (s.ui.shortcuts = !s.ui.shortcuts))
  if (key === ']') return run(() => s.arrange('forward'))
  if (key === '[') return run(() => s.arrange('backward'))
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key.startsWith('Arrow')) session.value?.commit()
}
</script>

<template>
  <div class="studio screen-editor" data-testid="screen-editor">
    <EditorWorkspace v-if="session" :session="session" />
    <div v-else-if="error" class="screen-editor__error">
      <p>{{ error }}</p>
      <button class="s-btn" @click="router.push('/screens')">返回列表</button>
    </div>
  </div>
</template>

<style scoped>
.screen-editor {
  display: flex;
  height: 100vh;
  flex-direction: column;
  overflow: hidden;
}
.screen-editor__error {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--s-fg-2);
}
</style>
