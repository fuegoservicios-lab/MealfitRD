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
      // [P2-PWA-SKIPWAITING · 2026-05-30] 'prompt' (era 'autoUpdate'). El SW
      // nuevo NO toma control hasta que el usuario acepta el toast "Nueva
      // versión" (main.jsx onNeedRefresh → updateSW(true) → SKIP_WAITING en
      // custom-sw.js). Evita el reload abrupto a mitad de un formulario largo
      // (Assessment) o del chat, y cierra el agujero de stale-bundle: antes el
      // SW nuevo quedaba en 'waiting' indefinidamente y el usuario servía el
      // bundle viejo por días tras un deploy.
      registerType: 'prompt',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // [P2-PWA-PRECACHE-TRIM · 2026-05-30] Excluir del precache assets
        // pesados que NO necesitan estar disponibles offline en el primer
        // install. Antes el SW descargaba ~5.8MB de golpe en la 1ª visita
        // (costoso en datos móviles del mercado es-DO). Excluidos:
        //   - html2pdf-*.js (~976KB): lazy `await import()` on-demand (P2-LAZY-PDF);
        //     se baja solo cuando el usuario exporta el PDF, no en el install.
        //   - auth_bg_new.png (~655KB) / dashboard_bg.png (~560KB): fondos CSS
        //     que el navegador pide por red al renderizar; degradan a fondo
        //     liso sin red (no hay requisito offline-first cosmético). [P6-SPEED-IMG]
        //     Ahora sirven .webp (18.9/43.6KB) vía image-set; estos .png son solo
        //     fallback y los .webp NO están en globPatterns → ninguno se precachea.
        //   - og-image.png (~174KB) [P6-SPEED-IMG · 2026-06-01]: imagen Open Graph
        //     que SOLO piden los unfurlers de redes sociales (WhatsApp/Slack/X) al
        //     hacer GET al index.html. NUNCA se renderiza en la app → no necesita
        //     estar offline. Excluirla recorta el precache sin afectar UX.
        // El app-shell (JS/CSS/HTML + favicons) SÍ se precachea para el
        // offline-load.
        globIgnores: [
          'assets/html2pdf-*.js',
          'auth_bg_new.png',
          'dashboard_bg.png',
          'og-image.png',
        ],
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
          // [P1-NEON-AUTH-MIGRATION · 2026-06-13] supabase-js → neon-js (Neon Auth).
          'vendor-neon-auth': ['@neondatabase/neon-js'],
          // [P1-PERF-FRAMER-SPLIT · 2026-05-31] framer-motion REMOVIDO de
          // vendor-ui y SIN manualChunk propio. Antes vivía junto a lucide-react +
          // sonner; como ambos se importan EAGER (lucide en Login/Register/Header/
          // Footer/DashboardLayout, sonner Toaster en App), todo vendor-ui (incl.
          // framer ~39KB gzip) caía en el critical path con modulepreload. framer
          // SOLO lo usan páginas/componentes lazy (Dashboard/Plan/Recipes/Settings/
          // History/Home/Modal/PaymentModal/…) — ningún módulo eager lo importa.
          // Darle un manualChunk explícito (`vendor-motion`) NO ayudaba: Vite igual
          // emite <link modulepreload> para todo vendor chunk nombrado → seguía
          // descargándose al arranque. Dejándolo SIN listar, Rollup lo auto-divide
          // en un chunk compartido que se carga on-demand (vía __vitePreload) solo
          // cuando la primera ruta lazy que lo usa se monta → fuera del critical
          // path real. lucide + sonner siguen en vendor-ui (sí eager, justificado).
          'vendor-ui': ['lucide-react', 'sonner'],
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
  },
}))
