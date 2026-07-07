import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api/* requests to the Express backend during local dev,
    // so the frontend can always call fetch('/api/metrics') with no
    // port number — same as it will behind nginx in production.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
