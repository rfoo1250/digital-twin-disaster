import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5656,
    open: true
  },
  build: {
    outDir: 'distb'     // default output folder
  }
})