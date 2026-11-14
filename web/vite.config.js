import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  // La geometría 50m (≈750 kB) se carga bajo demanda al acercar; no es parte del arranque.
  build: { chunkSizeWarningLimit: 800 }
})
