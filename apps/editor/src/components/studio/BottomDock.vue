<script setup lang="ts">
import { Camera, ChevronDown, Clapperboard, Play, Plus, RefreshCw, Repeat, Square, Trash2, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import type { TourStep } from '@twin-studio/core'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import { useShell } from '@/studio/shell'

const session = useSession()
const shell = useShell()
const doc = computed(() => session.doc.value)
const tourId = ref<string | null>(doc.value.tours[0]?.id ?? null)
const tour = computed(() => doc.value.tours.find(item => item.id === tourId.value) ?? null)
const renaming = ref<string | null>(null)
watch(
  () => doc.value.tours.map(item => item.id).join(','),
  () => {
    if (!tour.value) tourId.value = doc.value.tours[0]?.id ?? null
  },
)
const bookmarkOf = (id: string | null) => doc.value.bookmarks.find(item => item.id === id)
const playing = computed(() => session.ui.tour.playing && session.ui.tour.tourId === tour.value?.id)

async function captureStep(): Promise<void> {
  if (!tour.value) newTour(false)
  const bookmarkId = await session.addBookmark(`导览视角 ${doc.value.bookmarks.length + 1}`)
  if (tour.value) session.addTourStep(tour.value.id, { bookmarkId })
}

function newTour(fromBookmarks: boolean): void {
  tourId.value = session.addTour(fromBookmarks)
}

function updateStep(step: TourStep, recipe: (step: TourStep) => void, key?: string): void {
  if (!tour.value) return
  session.updateTour(
    tour.value.id,
    target => {
      const found = target.steps.find(item => item.id === step.id)
      if (found) recipe(found)
    },
    key && `step:${step.id}:${key}`,
  )
}

function removeStep(step: TourStep): void {
  if (tour.value)
    session.updateTour(tour.value.id, target => void (target.steps = target.steps.filter(item => item.id !== step.id)))
}

function moveStep(step: TourStep, delta: number): void {
  if (!tour.value) return
  session.updateTour(tour.value.id, target => {
    const index = target.steps.findIndex(item => item.id === step.id)
    const next = index + delta
    if (index < 0 || next < 0 || next >= target.steps.length) return
    const [moved] = target.steps.splice(index, 1)
    target.steps.splice(next, 0, moved!)
  })
}

const totalSeconds = computed(() => tour.value?.steps.reduce((sum, step) => sum + step.duration + step.hold, 0) ?? 0)
</script>

<template>
  <section class="dock" :class="{ 'is-open': shell.dockOpen }" data-testid="bottom-dock">
    <header class="dock__head">
      <button class="dock__toggle" @click="shell.dockOpen = !shell.dockOpen">
        <ChevronDown :size="13" class="dock__chevron" />
        视角与导览
      </button>
      <span class="s-hint">{{ doc.bookmarks.length }} 个视角 · {{ doc.tours.length }} 个导览</span>
    </header>

    <div v-if="shell.dockOpen" class="dock__body">
      <!-- Bookmarks -->
      <div class="dock__views">
        <div class="dock__label">视角</div>
        <div class="views">
          <button class="view view--add" title="保存当前视角" data-testid="add-bookmark" @click="session.addBookmark()">
            <Camera :size="16" /><span>保存当前视角</span>
          </button>
          <div
            v-for="bookmark in doc.bookmarks"
            :key="bookmark.id"
            class="view"
            :data-testid="`bookmark-${bookmark.name}`"
            @click="session.flyToBookmark(bookmark.id)"
          >
            <img v-if="bookmark.thumbnail" :src="bookmark.thumbnail" alt="" />
            <div v-else class="view__blank" />
            <div class="view__name" @dblclick.stop="renaming = bookmark.id">
              <input
                v-if="renaming === bookmark.id"
                class="view__rename"
                :value="bookmark.name"
                autofocus
                @click.stop
                @blur="
                  (session.renameBookmark(bookmark.id, ($event.target as HTMLInputElement).value), (renaming = null))
                "
                @keydown.enter="($event.target as HTMLInputElement).blur()"
              />
              <span v-else>{{ bookmark.name }}</span>
            </div>
            <div class="view__actions">
              <button class="view__action" title="用当前镜头更新" @click.stop="session.updateBookmarkView(bookmark.id)">
                <RefreshCw :size="11" />
              </button>
              <button class="view__action" title="删除视角" @click.stop="session.removeBookmark(bookmark.id)">
                <X :size="11" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tours -->
      <div class="dock__tours">
        <div class="tour-bar">
          <Clapperboard :size="14" class="tour-bar__icon" />
          <select v-if="doc.tours.length" v-model="tourId" class="s-select tour-bar__select" data-testid="tour-select">
            <option v-for="item in doc.tours" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <span v-else class="s-hint">导览：按顺序飞过多个视角，配合字幕自动讲解</span>
          <template v-if="tour">
            <UiText
              class="tour-bar__name"
              :model-value="tour.name"
              @commit="session.updateTour(tour.id, t => void (t.name = $event.trim() || t.name))"
            />
            <button
              class="s-icon-btn"
              :class="{ 'is-active': tour.loop }"
              :title="tour.loop ? '循环播放（点击关闭）' : '单次播放（点击开启循环）'"
              @click="session.updateTour(tour.id, t => void (t.loop = !t.loop))"
            >
              <Repeat :size="14" />
            </button>
            <span class="s-hint">{{ tour.steps.length }} 步 · 约 {{ Math.round(totalSeconds) }} 秒</span>
            <button
              v-if="!playing"
              class="s-btn s-btn--sm"
              :disabled="!tour.steps.length"
              data-testid="play-tour"
              @click="session.playTour(tour.id)"
            >
              <Play :size="11" />播放
            </button>
            <button v-else class="s-btn s-btn--sm" @click="session.stopTour()"><Square :size="10" />停止</button>
            <button class="s-icon-btn" title="删除导览" @click="session.removeTour(tour.id)">
              <Trash2 :size="13" />
            </button>
          </template>
          <span class="tour-bar__spacer" />
          <button class="s-btn s-btn--sm" data-testid="new-tour" @click="newTour(false)">
            <Plus :size="11" />新建
          </button>
          <button
            class="s-btn s-btn--sm"
            :disabled="!doc.bookmarks.length"
            title="按现有视角顺序生成导览"
            @click="newTour(true)"
          >
            由视角生成
          </button>
        </div>
        <div class="steps">
          <div
            v-for="(step, index) in tour?.steps ?? []"
            :key="step.id"
            class="step"
            :class="{ 'is-current': playing && session.ui.tour.stepIndex === index }"
          >
            <div class="step__head">
              <span class="step__index">{{ index + 1 }}</span>
              <select
                class="s-select step__view"
                :value="step.bookmarkId ?? ''"
                @change="
                  updateStep(step, s => void (s.bookmarkId = ($event.target as HTMLSelectElement).value || null))
                "
              >
                <option value="">（保持当前镜头）</option>
                <option v-for="bookmark in doc.bookmarks" :key="bookmark.id" :value="bookmark.id">
                  {{ bookmark.name }}
                </option>
              </select>
              <button class="view__action" title="前移" @click="moveStep(step, -1)">‹</button>
              <button class="view__action" title="后移" @click="moveStep(step, 1)">›</button>
              <button class="view__action" title="删除步骤" @click="removeStep(step)"><X :size="11" /></button>
            </div>
            <img
              v-if="bookmarkOf(step.bookmarkId)?.thumbnail"
              class="step__thumb"
              :src="bookmarkOf(step.bookmarkId)!.thumbnail"
              alt=""
              @click="session.playTour(tour!.id, index)"
            />
            <UiText
              class="step__caption"
              :model-value="step.caption"
              placeholder="字幕（可选）"
              @commit="updateStep(step, s => void (s.caption = $event))"
            />
            <div class="step__times">
              <UiNumber
                label="飞"
                :model-value="step.duration"
                :min="0"
                :max="60"
                :step="0.1"
                :precision="1"
                unit="s"
                @update="updateStep(step, s => void (s.duration = $event), 'duration')"
                @commit="session.commit()"
              />
              <UiNumber
                label="停"
                :model-value="step.hold"
                :min="0"
                :max="600"
                :step="0.5"
                :precision="1"
                unit="s"
                @update="updateStep(step, s => void (s.hold = $event), 'hold')"
                @commit="session.commit()"
              />
            </div>
          </div>
          <button class="step step--add" data-testid="add-step" @click="captureStep">
            <Camera :size="16" />
            <span>当前镜头<br />添加为步骤</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dock {
  flex-shrink: 0;
  border-top: 1px solid var(--s-line);
  background: var(--s-panel);
}
.dock__head {
  display: flex;
  height: 28px;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
}
.dock__toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--s-fg);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.dock__chevron {
  color: var(--s-fg-3);
  transform: rotate(-90deg);
  transition: transform 140ms ease;
}
.dock.is-open .dock__chevron {
  transform: none;
}
.dock__body {
  display: grid;
  height: 176px;
  grid-template-columns: minmax(220px, 0.9fr) minmax(320px, 1.4fr);
  border-top: 1px solid var(--s-line);
}
.dock__views {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid var(--s-line);
}
.dock__label {
  padding: 6px 10px 4px;
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.views {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 6px;
  overflow-x: auto;
  padding: 0 10px 10px;
}
.view {
  position: relative;
  display: flex;
  width: 132px;
  flex-shrink: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--s-line-2);
  border-radius: 6px;
  background: var(--s-panel-2);
  cursor: pointer;
}
.view:hover {
  border-color: var(--s-accent-line);
}
.view img,
.view__blank {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: #222;
}
.view__name {
  overflow: hidden;
  padding: 5px 7px;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.view__rename {
  width: 100%;
  border: 0;
  background: var(--s-field);
  outline: 1px solid var(--s-accent-line);
  font-size: 11px;
}
.view__actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 120ms ease;
}
.view:hover .view__actions {
  opacity: 1;
}
.view__action {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: rgb(14 15 17 / 0.75);
  color: var(--s-fg-2);
  font-size: 12px;
  cursor: pointer;
}
.view__action:hover {
  color: var(--s-fg);
}
.view--add {
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-style: dashed;
  background: transparent;
  color: var(--s-fg-3);
  font-size: 11px;
}
.view--add:hover {
  color: var(--s-accent-2);
}
.dock__tours {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.tour-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 4px;
}
.tour-bar__icon {
  color: var(--s-accent-2);
}
.tour-bar__select {
  width: 120px;
  height: 24px;
}
.tour-bar__name {
  width: 110px;
  height: 24px;
}
.tour-bar__spacer {
  flex: 1;
}
.steps {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 6px;
  overflow-x: auto;
  padding: 0 10px 10px;
}
.step {
  display: flex;
  width: 168px;
  flex-shrink: 0;
  flex-direction: column;
  gap: 4px;
  padding: 5px;
  border: 1px solid var(--s-line-2);
  border-radius: 6px;
  background: var(--s-panel-2);
}
.step.is-current {
  border-color: var(--s-accent);
  box-shadow: 0 0 0 1px var(--s-accent-soft);
}
.step__head {
  display: flex;
  align-items: center;
  gap: 3px;
}
.step__index {
  display: grid;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 50%;
  background: var(--s-accent-soft);
  color: var(--s-accent-2);
  font-size: 10px;
  font-weight: 700;
}
.step__view {
  height: 20px;
  padding: 0 14px 0 4px;
  font-size: 10.5px;
  background-position: right 4px center;
}
.step__thumb {
  width: 100%;
  height: 34px;
  border-radius: 3px;
  object-fit: cover;
  cursor: pointer;
}
.step__caption {
  height: 22px;
  font-size: 11px;
}
.step__times {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
}
.step__times :deep(.ui-number) {
  height: 20px;
}
.step--add {
  align-items: center;
  justify-content: center;
  width: 92px;
  border-style: dashed;
  background: transparent;
  color: var(--s-fg-3);
  font-size: 10.5px;
  text-align: center;
  cursor: pointer;
}
.step--add:hover {
  border-color: var(--s-accent-line);
  color: var(--s-accent-2);
}
</style>
