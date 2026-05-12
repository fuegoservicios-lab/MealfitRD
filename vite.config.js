import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
//
// [P3-FRONTEND-1 · 2026-05-12] Strip de `console.log/warn/debug/info` y
// `debugger` en builds production via esbuild. Preserva `console.error` /
// `console.trace` / `console.assert` para mantener trazas de errores
// genuinos en prod (críticos para post-mortem cuando un usuario reporta
// un bug por screenshot). En `mode !== 'production'` (dev, test) no se
// aplica nada — los logs siguen visibles para Vitest + debug interactivo.
//
// Razón del audit 2026-05-11: 141 console.* en 24 archivos source.
// Muchos legítimos para debug local pero terminaban en el bundle público
// ofuscando logs de error reales en producción + leak menor de
// info interna (ej. shape de respuestas, IDs internos).
//
// esbuild `pure` marca las funciones como side-effect-free → si el return
// value no se usa (siempre true para console.*) el call es eliminado por
// tree-shaking. No requiere terser ni deps extra.
// Anchor: P3-FRONTEND-1-ESBUILD-DROP-CONSOLE.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'custom-sw.js',
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'MealfitRD | Nutrición con IA',
        short_name: 'MealfitRD',
        description: 'Planes de alimentación personalizados con IA avanzada.',
        theme_color: '#4F46E5',
        background_color: '#111827',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  // [P3-FRONTEND-1 · 2026-05-12] esbuild config solo en production. En dev
  // y test los logs se preservan (debug interactivo + Vitest specs que
  // inspeccionan console output siguen funcionando).
  esbuild: mode === 'production' ? {
    drop: ['debugger'],
    pure: ['console.log', 'console.warn', 'console.debug', 'console.info'],
  } : {},
  build: {
    // Target modern browsers for smaller output
    target: 'es2020',
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Chunk strategy for optimal caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor: heavy libs cached separately
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['framer-motion', 'lucide-react', 'sonner'],
        }
      }
    },
    // Reduce chunk size warnings threshold
    chunkSizeWarningLimit: 500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
  },
}))
