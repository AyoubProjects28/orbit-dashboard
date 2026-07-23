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
  test: {
    // jsdom fournit document/window aux tests de composants ; les modules
    // purs (lib/, orbitChart) n'en dépendent pas mais partagent la config.
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // Le build de production sort dans nasa-front/ — ne jamais y chercher de tests.
    exclude: ['node_modules/**', 'nasa-front/**', 'nasa-back/**'],
  },
})
