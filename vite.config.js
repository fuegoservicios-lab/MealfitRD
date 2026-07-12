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
        //   - dashboard_bg.png (~560KB): fondo CSS que el navegador pide por red al
        //     renderizar; degrada a fondo liso sin red (no hay requisito offline-first
        //     cosmético). [P6-SPEED-IMG] Sirve .webp (43.6KB) vía image-set; el .png es
        //     solo fallback y el .webp NO está en globPatterns → ninguno se precachea.
        //     (auth_bg_new.png/.webp eliminados en P2-DEAD-CODE-SAFE — el fondo de Auth
        //     es ahora un gradient CSS.)
        //   - og-image.png (~174KB) [P6-SPEED-IMG · 2026-06-01]: imagen Open Graph
        //     que SOLO piden los unfurlers de redes sociales (WhatsApp/Slack/X) al
        //     hacer GET al index.html. NUNCA se renderiza en la app → no necesita
        //     estar offline. Excluirla recorta el precache sin afectar UX.
        // El app-shell (JS/CSS/HTML + favicons) SÍ se precachea para el
        // offline-load.
        globIgnores: [
          'assets/html2pdf-*.js',
          'dashboard_bg.png',
          'og-image.png',
        ],
      },
      includeAssets: ['favicon.png'],
      // [P2-MANIFEST-DEDUPE · 2026-07-09] `manifest: false`. Antes convivían DOS
      // manifests divergentes en el HTML compilado: el <link rel="manifest"
      // href="/manifest.json"> manual de index.html (SSOT rico: lang es-DO,
      // orientation, shortcuts, iconos P3-PWA-ICON-PADDING) y el
      // manifest.webmanifest que inyectaba este plugin (lang 'en', sin
      // shortcuts ni orientation). El browser tomaba el primero, pero la
      // duplicación era ambigua y drift-prone. public/manifest.json queda como
      // SSOT único; el plugin sigue generando SOLO el service worker.
      manifest: false,
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
          // [P2-VENDOR-REACT-CLIENT · 2026-07-09] 'react-dom/client' añadido:
          // es un export-path SEPARADO que NO es dependencia de react-dom/index,
          // así que listar solo 'react-dom' dejaba react-dom-client.production
          // (~130KB min / ~40KB gzip — el reconciler entero) dentro del ENTRY
          // chunk, cuyo hash cambia en cada deploy → los usuarios re-descargaban
          // el framework en cada release en vez de servirlo del cache del vendor
          // chunk estable. Verificado con rollup-plugin-visualizer 2026-07-09.
          'vendor-react': ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
          // [P2-NEON-LAZY · 2026-07-12] `vendor-neon-auth` REMOVIDO de manualChunks
          // (misma lección que framer, abajo): un vendor chunk NOMBRADO recibe
          // <link modulepreload> eager de Vite aunque solo se alcance por dynamic
          // import. authClient.js ahora carga el SDK vía import() → sin nombrarlo,
          // Rollup lo auto-divide en un chunk async on-demand (vía __vitePreload),
          // fuera del critical path. El SDK (~89KB gzip) solo se descarga al primer
          // uso de auth (getSession/login), no en la landing pública.
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
    // [P1-4 · COVERAGE-REPORT-ONLY · 2026-07-09] @vitest/coverage-v8 en modo
    // REPORT-ONLY: thresholds en 0 → nunca falla CI (informa, no bloquea).
    // Publica lcov (artefacto CI) + text-summary (consola). Excluye targets no-
    // ejecutables (tests, config, tipos ambient, scaffolds) para que el % refleje
    // codigo de producto, no ruido. Correr con `vitest run --coverage`.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      all: false,
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
      exclude: [
        'node_modules/**',
        'dist/**',
        'e2e/**',
        'coverage/**',
        'src/**/*.test.{js,jsx}',
        'src/**/__tests__/**',
        'src/setupTests.js',
        'src/types/**',
        '**/*.config.{js,mjs,ts}',
        'scripts/**',
      ],
    },
    // [P1-VITEST-EXCLUDE-E2E · 2026-06-25] Los specs de `e2e/` son Playwright
    // (necesitan navegador + servidor levantado) — el glob default de vitest
    // (`**/*.spec.js`) los recogía y fallaban en el run unitario. Se ejecutan
    // aparte con `npm run test:e2e` (playwright test). Preservamos los excludes
    // default de vitest (no se importa configDefaults para no acoplar el build).
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'e2e/**',
    ],
  },
}))
