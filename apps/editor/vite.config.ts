import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Workspace packages expose a "source" export so the Editor runs them without a prior build.
    conditions: ['source', ...defaultClientConditions],
    dedupe: ['three', 'vue'],
  },
})
