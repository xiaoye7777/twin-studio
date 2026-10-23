<script setup lang="ts">
import { Maximize, Minimize, PenLine } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ScreenDocument } from '@/screen/model'
import ScreenPage from '@/screen/render/ScreenPage.vue'
import { ScreenRuntime, ScreenRuntimeKey } from '@/screen/runtime/ScreenRuntime'
import { screenRepository } from '@/screen/storage/ScreenRepository'
import '@/screen/widgets'

const route = useRoute()
const router = useRouter()
const screenId = String(route.params.screenId)
/** play: the published version (the big screen); version: one saved version; draft: the latest edits. */
const mode = route.name === 'screen-play' ? 'play' : route.query.version ? 'version' : 'draft'
const screen = shallowRef<ScreenDocument | null>(null)
const error = ref('')
/** A line at the top saying what is shown, when it is not what one would expect. */
const notice = ref('')
const runtime = new ScreenRuntime(false)
provide(ScreenRuntimeKey, runtime)
if (import.meta.env.DEV) (window as unknown as { __screenRuntime?: ScreenRuntime }).__screenRuntime = runtime
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const fullscreen = ref(false)
const chrome = ref(true)
let chromeTimer: ReturnType<typeof setTimeout> | null = null
let channel: BroadcastChannel | null = null

/** Page → screen transform for the page's scaling mode. */
const fitting = computed(() => {
  const page = screen.value?.page
  if (!page) return { sx: 1, sy: 1, left: 0, top: 0, scroll: false }
  const { width, height } = viewport.value
  const fx = width / page.width
  const fy = height / page.height
  let sx = Math.min(fx, fy)
  let sy = sx
  if (page.scaleMode === 'fill') sx = sy = Math.max(fx, fy)
  else if (page.scaleMode === 'width') sx = sy = fx
  else if (page.scaleMode === 'height') sx = sy = fy
  else if (page.scaleMode === 'stretch') {
    sx = fx
    sy = fy
  }
  const scroll = page.scaleMode === 'width' && page.height * sy > height
  return {
    sx,
    sy,
    left: (width - page.width * sx) / 2,
    top: scroll ? 0 : (height - page.height * sy) / 2,
    scroll,
  }
})

/** The document this page shows, by mode. */
async function source(): Promise<ScreenDocument | null> {
  if (mode === 'version') {
    const version = await screenRepository.getVersion(String(route.query.version))
    if (version) {
      const time = new Date(version.createdAt).toLocaleString('zh-CN', { hour12: false })
      notice.value = `历史版本预览：${version.label} · ${time}`
    }
    return version?.document ?? null
  }
  const draft = await screenRepository.get(screenId)
  if (mode === 'play' && draft) {
    const version = draft.published ? await screenRepository.getVersion(draft.published.versionId) : null
    notice.value = version ? '' : '这个大屏还没有发布，显示的是草稿'
    if (version) return version.document
  }
  return draft
}

async function load(): Promise<void> {
  const document = await source()
  if (!document) {
    error.value = mode === 'version' ? '找不到这个版本，可能已被删除' : '找不到这个数据大屏，可能已被删除'
    return
  }
  // Charts render sharp at the scale they are shown at.
  runtime.scale.value = Math.max(fitting.value.sx, fitting.value.sy)
  screen.value = document
  runtime.setDocument(document)
  window.document.title = `${document.name} · 数据大屏`
}

function onResize(): void {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
}

function wake(): void {
  chrome.value = true
  if (chromeTimer) clearTimeout(chromeTimer)
  chromeTimer = setTimeout(() => (chrome.value = false), 2500)
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen()
}
const onFullscreen = () => (fullscreen.value = !!document.fullscreenElement)

onMounted(async () => {
  await load()
  window.addEventListener('resize', onResize)
  window.addEventListener('pointermove', wake)
  document.addEventListener('fullscreenchange', onFullscreen)
  wake()
  // Follow the editor: the draft preview reloads on each save, the big screen on each publish.
  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('twin-studio-screens')
  channel?.addEventListener('message', event => {
    const message = event.data as { type?: string; id?: string }
    if (message.id !== screenId || mode === 'version') return
    if (mode === 'draft' ? message.type === 'saved' : message.type === 'published') void load()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('pointermove', wake)
  document.removeEventListener('fullscreenchange', onFullscreen)
  if (chromeTimer) clearTimeout(chromeTimer)
  channel?.close()
  runtime.dispose()
})
</script>

<template>
  <main
    class="preview"
    :class="{ 'is-scroll': fitting.scroll }"
    :style="{ background: screen?.page.background.color ?? '#000' }"
    data-testid="screen-preview"
  >
    <div
      v-if="screen"
      class="preview__stage"
      :style="{ transform: `translate(${fitting.left}px, ${fitting.top}px) scale(${fitting.sx}, ${fitting.sy})` }"
    >
      <ScreenPage :screen="screen" :editing="false" />
    </div>
    <p v-else-if="error" class="preview__error">{{ error }}</p>
    <p v-if="notice" class="preview__notice" data-testid="preview-notice">{{ notice }}</p>
    <div class="preview__chrome" :class="{ 'is-hidden': !chrome }">
      <button title="编辑" @click="router.push({ name: 'screen-editor', params: { screenId } })">
        <PenLine :size="16" />
      </button>
      <button :title="fullscreen ? '退出全屏' : '全屏'" data-testid="preview-fullscreen" @click="toggleFullscreen">
        <Minimize v-if="fullscreen" :size="16" /><Maximize v-else :size="16" />
      </button>
    </div>
  </main>
</template>

<style scoped>
.preview {
  position: fixed;
  inset: 0;
  overflow: hidden;
}
.preview.is-scroll {
  overflow-y: auto;
}
.preview__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.preview__notice {
  position: fixed;
  top: 12px;
  left: 50%;
  margin: 0;
  padding: 4px 14px;
  border: 1px solid rgb(226 180 86 / 0.45);
  border-radius: 14px;
  background: rgb(20 16 8 / 0.82);
  color: #f2cf86;
  font-size: 12.5px;
  transform: translateX(-50%);
  pointer-events: none;
}
.preview__error {
  margin: 40vh auto 0;
  color: #94a3b8;
  text-align: center;
}
.preview__chrome {
  position: fixed;
  z-index: 50;
  top: 14px;
  right: 14px;
  display: flex;
  gap: 6px;
  transition: opacity 300ms ease;
}
.preview__chrome.is-hidden {
  opacity: 0;
  pointer-events: none;
}
.preview__chrome button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgb(148 163 184 / 0.3);
  border-radius: 8px;
  background: rgb(15 23 42 / 0.75);
  color: #e2e8f0;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
</style>
