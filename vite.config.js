import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Matches the folder name used on web-test01 (/opt/projects/nasa-front)
    // so local build output and the VM deployment path stay aligned.
    outDir: 'nasa-front',
  },
  server: {
    // Forward /api/* requests to the Express backend during local dev,
    // so the frontend can always call fetch('/api/metrics') with no
    // port number — same as it will behind nginx in production.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
