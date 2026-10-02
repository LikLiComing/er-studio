import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/er-studio/' : '/',
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['monaco-editor'],
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor')) return 'monaco'
          if (id.includes('node_modules/@dbml/core')) return 'dbml-core'
          if (id.includes('node_modules/@dbml/parse')) return 'dbml-parse'
          if (id.includes('node_modules/vue')) return 'vue'
        },
      },
    },
  },
}))
