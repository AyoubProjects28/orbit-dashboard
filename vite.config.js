import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Matches the folder name used on web-test01 (/opt/projects/nasa-front)
    // so local build output and the VM deployment path stay aligned.
    outDir: 'nasa-front',
    // Vite's default empties outDir before every build. nasa-front/ also
    // holds monitor.html (Antoine's dashboard, kept running side by side
    // until the fusion migration is done — see docs/superpowers/specs/
    // 2026-07-23-orbit-dashboard-fusion-design.md §8.3) plus its own
    // favicon/icons/older asset bundles, none of which Vite knows about.
    // A default build silently deletes all of it. Disabled until monitor.html
    // is retired at Step 5 of that migration.
    emptyOutDir: false,
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
