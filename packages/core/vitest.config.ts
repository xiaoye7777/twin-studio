import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Pure, browser-independent code; rendering and runtime are covered by the browser suites.
      include: [
        'src/domain/**',
        'src/infrastructure/packages/packageFormat.ts',
        'src/infrastructure/packages/validatePortableAsset.ts',
      ],
      // Reads Three.js objects; replaced by the document-first editor core in the next step.
      exclude: ['src/domain/scene/sceneSerializer.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
})
