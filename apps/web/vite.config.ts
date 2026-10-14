import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pre-bundled at startup, so Vite never has to re-optimize it mid-session (the "504 Outdated Optimize Dep" error).
  optimizeDeps: {
    include: ['qrcode-generator', 'jsqr'],
  },
  server: {
    // Listen on the local network too, so phones on the same Wi-Fi can open the site (e.g. table QR codes).
    host: true,
    // Same-origin requests in development, so the admin session cookie just works.
    proxy: {
      '/api': API_TARGET,
      '/uploads': API_TARGET,
    },
  },
})
