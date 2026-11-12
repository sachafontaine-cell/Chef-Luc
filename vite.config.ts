import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// GitHub Pages serves the app under the repository name (case matters).
const BASE = '/Chef-Luc/'

export default defineConfig({
  base: BASE,
  define: { __VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['dm-serif-display.ttf', 'apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'Chef Luc',
        short_name: 'Chef Luc',
        description: 'Recettes et mode cuisine pour la famille.',
        lang: 'fr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F3EA',
        theme_color: '#F7F3EA',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything, photos included, is kept on the phone so browsing and cooking work offline.
        globPatterns: ['**/*.{js,css,html,png,svg,ttf,jpg}'],
        navigateFallback: BASE + 'index.html',
        importScripts: ['sw-extra.js'],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  build: { target: 'es2022', cssCodeSplit: false, modulePreload: false },
  test: { environment: 'node' },
})
