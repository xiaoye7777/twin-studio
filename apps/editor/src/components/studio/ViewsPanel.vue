<script setup lang="ts">
/** 左栏「视角」页签：保存的镜头视角（书签）和导览。两块都可以折叠。 */
import { Camera, RefreshCw, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import UiSection from '@/components/ui/UiSection.vue'
import { useSession } from '@/studio/context'
import TourEditor from './TourEditor.vue'

const session = useSession()
const doc = computed(() => session.doc.value)
const renaming = ref<string | null>(null)
</script>

<template>
  <div class="s-scroll" data-testid="views-panel">
    <UiSection title="视角" :count="doc.bookmarks.length">
      <template #actions>
        <button
          class="s-btn s-btn--sm"
          title="保存当前镜头为视角"
          data-testid="add-bookmark"
          @click="session.views.addBookmark()"
        >
          <Camera :size="12" />保存当前视角
        </button>
      </template>
      <p v-if="!doc.bookmarks.length" class="views__note s-hint">调好镜头后保存，点击即可飞回；导览也由视角串成。</p>
      <div class="views">
        <div
          v-for="bookmark in doc.bookmarks"
          :key="bookmark.id"
          class="view"
          :data-testid="`bookmark-${bookmark.name}`"
          @click="session.views.flyToBookmark(bookmark.id)"
        >
          <img
            v-if="bookmark.thumbnail || session.thumbnails[bookmark.id]"
            :src="bookmark.thumbnail || session.thumbnails[bookmark.id]"
            alt=""
          />
          <div v-else class="view__blank" />
          <div class="view__name" title="双击改名" @dblclick.stop="renaming = bookmark.id">
            <input
              v-if="renaming === bookmark.id"
              class="view__rename"
              :value="bookmark.name"
              autofocus
              @click.stop
              @blur="
                (session.views.renameBookmark(bookmark.id, ($event.target as HTMLInputElement).value),
                (renaming = null))
              "
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
            <span v-else>{{ bookmark.name }}</span>
          </div>
          <div class="view__actions">
            <button
              class="s-icon-btn"
              title="用当前镜头更新"
              @click.stop="session.views.updateBookmarkView(bookmark.id)"
            >
              <RefreshCw :size="11" />
            </button>
            <button class="s-icon-btn" title="删除视角" @click.stop="session.views.removeBookmark(bookmark.id)">
              <X :size="11" />
            </button>
          </div>
        </div>
      </div>
    </UiSection>

    <TourEditor />
  </div>
</template>

<style scoped>
.views__note {
  margin: 0;
  padding: 0 12px 6px;
}
.views {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 6px;
  padding: 0 8px;
}
.view {
  position: relative;
  display: flex;
  min-width: 0;
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
  background: var(--s-canvas);
}
.view__name {
  overflow: hidden;
  padding: 4px 6px;
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
  top: 3px;
  right: 3px;
  display: flex;
  gap: 2px;
  border-radius: 4px;
  background: var(--s-float);
  opacity: 0;
  transition: opacity 120ms ease;
}
.view:hover .view__actions {
  opacity: 1;
}
.view__actions .s-icon-btn {
  width: 20px;
  height: 20px;
}
</style>
