import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/testtt/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Ayuda Escolar',
        short_name: 'AyudaEscolar',
        description: 'Gestión de entregas de ayuda escolar municipal',
        theme_color: '#1a56db',
        background_color: '#f0f4f8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/testtt/',
        icons: [
          {
            src: '/testtt/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/testtt/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^\/apis\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^\/fotoss\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos-cache',
              expiration: { maxEntries: 200 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/apis':   'http://localhost:3013',
      '/fotoss': 'http://localhost:3013',
    },
  },
});
