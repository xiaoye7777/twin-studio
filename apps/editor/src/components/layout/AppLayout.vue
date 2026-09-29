<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50">
    <AppHeader />
    <div class="flex min-h-0 flex-1 pt-16">
      <AppSidebar />
      <main class="ml-56 min-w-0 flex-1 p-6 lg:p-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>
