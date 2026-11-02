<script setup lang="ts">
/** 导览：按顺序飞过多个视角，配合字幕自动讲解。这里编辑步骤，播放由 session.views → TourPlayer 负责。 */
import { Camera, ChevronDown, ChevronUp, Play, Plus, Repeat, Square, Trash2, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import type { TourStep } from '@twin-studio/core'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'

const session = useSession()
const doc = computed(() => session.doc.value)
const tourId = ref<string | null>(doc.value.tours[0]?.id ?? null)
const tour = computed(() => doc.value.tours.find(item => item.id === tourId.value) ?? null)
watch(
  () => doc.value.tours.map(item => item.id).join(','),
  () => {
    if (!tour.value) tourId.value = doc.value.tours[0]?.id ?? null
  },
)
const bookmarkOf = (id: string | null) => doc.value.bookmarks.find(item => item.id === id)
const playing = computed(() => session.ui.tour.playing && session.ui.tour.tourId === tour.value?.id)
const totalSeconds = computed(() => tour.value?.steps.reduce((sum, step) => sum + step.duration + step.hold, 0) ?? 0)

function newTour(fromBookmarks: boolean): void {
  tourId.value = session.views.addTour(fromBookmarks)
}

/** 把当前镜头存成视角，并加为导览的一步；还没有导览就先建一个。 */
async function captureStep(): Promise<void> {
  if (!tour.value) newTour(false)
  const bookmarkId = await session.views.addBookmark(`导览视角 ${doc.value.bookmarks.length + 1}`)
  if (tour.value) session.views.addTourStep(tour.value.id, { bookmarkId })
}

function updateStep(step: TourStep, recipe: (step: TourStep) => void, key?: string): void {
  if (!tour.value) return
  session.views.updateTour(
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
    session.views.updateTour(
      tour.value.id,
      target => void (target.steps = target.steps.filter(item => item.id !== step.id)),
    )
}

function moveStep(step: TourStep, delta: number): void {
  if (!tour.value) return
  session.views.updateTour(tour.value.id, target => {
    const index = target.steps.findIndex(item => item.id === step.id)
    const next = index + delta
    if (index < 0 || next < 0 || next >= target.steps.length) return
    const [moved] = target.steps.splice(index, 1)
    target.steps.splice(next, 0, moved!)
  })
}
</script>

<template>
  <UiSection title="导览" :count="doc.tours.length">
    <template #actions>
      <button class="s-btn s-btn--sm" data-testid="new-tour" @click="newTour(false)"><Plus :size="11" />新建</button>
      <button
        class="s-btn s-btn--sm"
        :disabled="!doc.bookmarks.length"
        title="按现有视角的顺序生成导览"
        @click="newTour(true)"
      >
        由视角生成
      </button>
    </template>

    <p v-if="!doc.tours.length" class="tour__note s-hint">按顺序飞过多个视角，配合字幕自动讲解。</p>
    <template v-else>
      <div class="tour__bar">
        <select v-model="tourId" class="s-select" data-testid="tour-select">
          <option v-for="item in doc.tours" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <button v-if="tour" class="s-icon-btn" title="删除导览" @click="session.views.removeTour(tour.id)">
          <Trash2 :size="13" />
        </button>
      </div>
      <template v-if="tour">
        <div class="tour__bar">
          <UiText
            :model-value="tour.name"
            placeholder="导览名称"
            @commit="session.views.updateTour(tour.id, t => void (t.name = $event.trim() || t.name))"
          />
          <button
            class="s-icon-btn"
            :class="{ 'is-active': tour.loop }"
            :title="tour.loop ? '循环播放（点击关闭）' : '单次播放（点击开启循环）'"
            @click="session.views.updateTour(tour.id, t => void (t.loop = !t.loop))"
          >
            <Repeat :size="14" />
          </button>
          <button
            v-if="!playing"
            class="s-btn s-btn--sm"
            :disabled="!tour.steps.length"
            data-testid="play-tour"
            @click="session.views.playTour(tour.id)"
          >
            <Play :size="11" />播放
          </button>
          <button v-else class="s-btn s-btn--sm" @click="session.views.stopTour()"><Square :size="10" />停止</button>
        </div>
        <p class="tour__note s-hint">{{ tour.steps.length }} 步 · 约 {{ Math.round(totalSeconds) }} 秒</p>
      </template>
    </template>

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
            @change="updateStep(step, s => void (s.bookmarkId = ($event.target as HTMLSelectElement).value || null))"
          >
            <option value="">（保持当前镜头）</option>
            <option v-for="bookmark in doc.bookmarks" :key="bookmark.id" :value="bookmark.id">
              {{ bookmark.name }}
            </option>
          </select>
          <button class="s-icon-btn step__action" title="上移" @click="moveStep(step, -1)">
            <ChevronUp :size="12" />
          </button>
          <button class="s-icon-btn step__action" title="下移" @click="moveStep(step, 1)">
            <ChevronDown :size="12" />
          </button>
          <button class="s-icon-btn step__action" title="删除步骤" @click="removeStep(step)"><X :size="12" /></button>
        </div>
        <img
          v-if="step.bookmarkId && (bookmarkOf(step.bookmarkId)?.thumbnail || session.thumbnails[step.bookmarkId])"
          class="step__thumb"
          :src="bookmarkOf(step.bookmarkId)?.thumbnail || session.thumbnails[step.bookmarkId]"
          alt=""
          title="从这一步开始播放"
          @click="session.views.playTour(tour!.id, index)"
        />
        <UiText
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
        <Camera :size="14" />当前镜头添加为步骤
      </button>
    </div>
  </UiSection>
</template>

<style scoped>
.tour__note {
  margin: 0;
  padding: 0 12px 6px;
}
.tour__bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px 6px;
}
.tour__bar .s-select {
  min-width: 0;
  flex: 1;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 8px;
}
.step {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
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
  min-width: 0;
  height: 22px;
  flex: 1;
  font-size: 11px;
}
.step__action {
  width: 20px;
  height: 20px;
}
.step__thumb {
  width: 100%;
  height: 54px;
  border-radius: 3px;
  object-fit: cover;
  cursor: pointer;
}
.step__times {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.step--add {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-style: dashed;
  background: transparent;
  color: var(--s-fg-3);
  font-size: 11px;
  cursor: pointer;
}
.step--add:hover {
  border-color: var(--s-accent-line);
  color: var(--s-accent-2);
}
</style>
