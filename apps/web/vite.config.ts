import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin requests in development, so the admin session cookie just works.
    proxy: {
      '/api': API_TARGET,
      '/uploads': API_TARGET,
    },
  },
})
