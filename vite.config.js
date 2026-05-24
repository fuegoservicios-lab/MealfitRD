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
      // [P2-PWA-DEV-MODE · 2026-05-12] `devOptions.enabled: true` registraba
      // el Service Worker en `npm run dev`. Riesgos:
      //   (a) Browsers que abrieron tanto localhost:5173 como mealfitrd.com
      //       en el mismo dispositivo pueden cachear bundles dev/stale en
      //       el SW y servirlos de vuelta en sesiones futuras (depende del
      //       scope del SW por origen).
      //   (b) Rompe HMR — cualquier cambio de source dispara invalidación
      //       parcial, dejando el module graph mitad nuevo / mitad cacheado.
      //   (c) Deja artefactos en `.vite/` que confunden bug reports
      //       ("¿por qué mi cambio no aparece?" cuando el SW lo intercepta).
      // Para testear PWA localmente: `npm run build && npm run preview`
      // (modo production-like sin tocar el binary corriendo).
      devOptions: {
        enabled: false,
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
    // [P0-PROD-AUDIT-1 · 2026-05-23] `sourcemap: false` explícito.
    //
    // Pre-fix: el config no declaraba `sourcemap`, que en Vite default es
    // `false` — pero un cambio silencioso en versión futura o en un PR
    // mal-revisado podría flippear a `true` o `'inline'`, exponiendo:
    //   - Stack traces legibles en DevTools (mapping a archivos source).
    //   - Code reverse-engineering trivial (`.js.map` accesible vía
    //     `view-source:` o fetch directo a `app-XXXX.js.map`).
    //   - Scouting de vulnerabilidades (variables internas, comments con
    //     anchors P-fix que revelan defensive logic, imports de utils
    //     sensibles como `secureFormStorage.js`).
    //
    // Decisión: `false` literal en lugar de relying on default. Un PR que
    // habilite source maps debería ser visible en review.
    //
    // Si en futuro se quiere upload a Sentry para mejorar stack traces de
    // errores sin leak público:
    //   - Cambiar a `'hidden'` (genera maps pero NO emite `//#
    //     sourceMappingURL=` comment → DevTools no los auto-carga).
    //   - Añadir `@sentry/vite-plugin` con `release` + `authToken` para
    //     upload + delete local post-build.
    //   - Configurar Vercel para servir `.map` con `404` (defensa contra
    //     fetch directo si delete fallara).
    // Follow-up: `P1-SENTRY-SOURCE-MAPS`.
    sourcemap: false,
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
    // [P3-VITE-CHUNK-WARNING-THRESHOLD · 2026-05-15] Cap reducido 500→300.
    // El cap default de Vite es 500 KB; bajarlo a 300 captura regresiones
    // de entry chunks que crecen accidentalmente (ej. import estático de
    // una lib pesada en lugar de dynamic import). Los chunks intencionalmente
    // lazy (html2pdf-*.js ~976KB, P2-LAZY-PDF) seguirán emitiendo warning
    // en cada build — es esperado y se ignora; la señal útil es cuando
    // aparece un NUEVO chunk > 300 KB. Si la señal/ruido empeora, override
    // per-chunk con `output.manualChunks` arriba.
    chunkSizeWarningLimit: 300,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
    // [F-P1-1 · 2026-05-23] Coverage config minimalista — habilitar via
    // `npm run test:coverage`. Sin gate `--coverage.thresholds.*` (decisión
    // MVP <100 MAU, análoga a backend P3-COVERAGE-HEATMAP). Cuando crucemos
    // 500 MAU + medición baseline, añadir `thresholds: { lines: 60, ... }`
    // y activar job CI dedicado. Test
    // `src/__tests__/coverage_gate_decision.test.js` ancla la decisión.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [
        'src/__tests__/**',
        'src/setupTests.js',
        'src/custom-sw.js',
        '**/*.d.ts',
        '**/*.config.js',
      ],
      // NO `thresholds` por ahora (decisión MVP <100 MAU).
    },
  },
}))
