import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: "What's Next",
        short_name: "What's Next",
        description: 'Voice brain dumps, turned into actionable tasks, notes and ideas.',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        runtimeCaching: [
          {
            // onnxruntime wasm is loaded lazily by the whisper worker; cache it
            // on first use so on-device transcription works offline afterwards.
            urlPattern: /\.wasm$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-runtime',
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Whisper model weights + onnxruntime wasm, so on-device
            // transcription keeps working fully offline after first download.
            urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs[^/]*\.(huggingface\.co|hf\.co)|cdn\.jsdelivr\.net)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'model-assets',
              expiration: { maxEntries: 120 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  worker: { format: 'es' }
});
