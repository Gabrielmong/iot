import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const SERVER = 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // HTTP and WebSocket both go to the API server in dev; in production it serves this app itself.
    proxy: {
      '/graphql': { target: SERVER, ws: true, changeOrigin: true },
      // Camera thumbnails, WebRTC signalling and the MSE WebSocket.
      '/api': { target: SERVER, ws: true, changeOrigin: true },
      // The Android app download.
      '/app': { target: SERVER, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
