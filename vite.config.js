import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5656,
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'distb'     // default output folder
  }
})