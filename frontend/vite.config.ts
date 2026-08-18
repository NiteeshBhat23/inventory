import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Fills the `%VITE_API_ORIGIN%` placeholder in index.html with the origin of
 *  VITE_API_BASE_URL, so the preconnect points at the real API host without
 *  the origin being duplicated in a second env var that could drift. */
function apiPreconnect(mode: string): Plugin {
  return {
    name: 'api-preconnect',
    transformIndexHtml: {
      // Resolve the placeholder before Vite's own env substitution runs,
      // otherwise it warns about a `%VITE_*%` token it doesn't recognise.
      order: 'pre',
      handler(html: string) {
        const base = loadEnv(mode, process.cwd(), '').VITE_API_BASE_URL
        let origin = ''
        try {
          if (base) origin = new URL(base).origin
        } catch {
          /* relative or malformed base URL — nothing worth preconnecting to */
        }
        // Drop the whole tag when there's no absolute origin to warm.
        return origin
          ? html.replace('%VITE_API_ORIGIN%', origin)
          : html.replace(/\s*<link rel="preconnect" href="%VITE_API_ORIGIN%"[^>]*>/, '')
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    apiPreconnect(mode),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ProfitPulse',
        short_name: 'ProfitPulse',
        description: 'Purchase, sale, and margin tracking for service center inventory',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // The API is authenticated and its freshness is managed in-app by the
        // request cache, so it must never be served from the service worker.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Google Fonts stylesheet + files: immutable once resolved, and
            // the slowest third-party thing on the critical path. Serving them
            // from cache makes every repeat visit paint text immediately.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // Split the vendor code by how often it changes, so a routine app deploy
    // doesn't invalidate the browser's copy of React or Supabase.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const path = id.replace(/\\/g, '/')
          if (!path.includes('/node_modules/')) return
          if (path.includes('/@phosphor-icons/')) return 'icons'
          if (path.includes('/@supabase/')) return 'supabase'
          if (
            /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(path)
          ) {
            return 'react-vendor'
          }
          return 'vendor'
        },
      },
    },
    // Trim ~10% off the JS payload versus esbuild's minifier.
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true },
    },
    // The lazy route chunks are small; inlining the tiny ones costs a request
    // each, so keep the default asset inlining but raise the warning bar to
    // match the vendor chunks we deliberately created.
    chunkSizeWarningLimit: 700,
  },
  server: {
    host: true,
  },
}))
