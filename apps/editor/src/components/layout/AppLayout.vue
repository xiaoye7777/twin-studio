<script setup lang="ts">
import { Boxes, FolderKanban } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import '@/studio/studio.css'

const route = useRoute()
const nav = [
  { to: '/projects', label: '项目', icon: FolderKanban },
  { to: '/assets', label: '资源库', icon: Boxes },
]
</script>

<template>
  <div class="studio-home home">
    <aside class="home__nav">
      <div class="home__brand">
        <span class="home__mark">T</span>
        <span class="home__brand-text"><strong>Twin Studio</strong><small>零碳园区数字孪生平台</small></span>
      </div>
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="home__link"
        :class="{ 'is-active': route.path.startsWith(item.to) }"
      >
        <component :is="item.icon" :size="16" />{{ item.label }}
      </RouterLink>
      <div class="home__version">
        <span>编辑器 v2 · 场景格式 v2</span>
        <span>Viewer SDK 0.5.0</span>
      </div>
    </aside>
    <main class="home__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.home {
  display: grid;
  min-height: 100vh;
  grid-template-columns: 220px minmax(0, 1fr);
  background: var(--s-bg);
  color: var(--s-fg);
  font:
    13px/1.5 Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
  color-scheme: dark;
}
.home__nav {
  position: sticky;
  top: 0;
  display: flex;
  height: 100vh;
  flex-direction: column;
  gap: 2px;
  padding: 16px 12px;
  border-right: 1px solid var(--s-line);
  background: var(--s-panel);
}
.home__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 20px;
}
.home__mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: linear-gradient(135deg, #f2a66c, #d9703a);
  color: #1b130c;
  font-size: 15px;
  font-weight: 800;
}
.home__brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.home__brand-text strong {
  font-size: 14px;
}
.home__brand-text small {
  color: var(--s-fg-3);
  font-size: 11px;
}
.home__link {
  display: flex;
  height: 34px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--s-fg-2);
  text-decoration: none;
}
.home__link:hover {
  background: var(--s-hover);
  color: var(--s-fg);
}
.home__link.is-active {
  background: var(--s-accent-soft);
  color: var(--s-accent-2);
}
.home__version {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: auto;
  padding: 10px;
  border-radius: 6px;
  background: var(--s-panel-2);
  color: var(--s-fg-3);
  font-size: 11px;
}
.home__main {
  min-width: 0;
  padding: 28px 36px 48px;
}
</style>
