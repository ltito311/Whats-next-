import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Demo build: one self-contained HTML file with sample data seeded on load.
// No service worker; on-device transcription is unavailable (the worker isn't
// inlined) — meant for sharing a look at the app, not daily use.
export default defineConfig({
  plugins: [react(), VitePWA({ disable: true }), viteSingleFile()],
  define: {
    'import.meta.env.VITE_DEMO': '"1"'
  },
  build: { outDir: 'dist-demo' },
  worker: { format: 'es' }
});
