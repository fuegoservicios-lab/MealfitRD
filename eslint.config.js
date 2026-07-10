import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
// [OPT-FRONTEND · 2026-06-22] eslint-plugin-react SOLO por la regla `jsx-uses-vars`
// (NO el preset `recommended`, que metería decenas de reglas nuevas y volvería el
// gate rojo). Sin ella, `no-unused-vars` es CIEGO al uso de identificadores en JSX
// (`<motion.div>`, `<Componente/>`) → daba ~17 falsos positivos (motion + componentes
// usados solo en JSX). Con ella el gate es FIABLE: un `no-unused-vars` restante es
// dead-code REAL. Cierra la trampa donde `git` removía un import "unused" según
// ESLint, el build pasaba, y el runtime crasheaba (ReferenceError en render).
import reactPlugin from 'eslint-plugin-react'
import { defineConfig, globalIgnores } from 'eslint/config'

// [P2-FRONTEND-LOCALSTORAGE-LINT · 2026-05-23] Selector AST que matchea
// `localStorage.getItem(...)`, `localStorage.setItem(...)`, `localStorage.removeItem(...)`
// raw. La intención NO es bloquear `localStorage` globalmente (la API es
// estándar y necesaria) sino forzar el uso del wrapper defensivo en
// `utils/safeLocalStorage.js` que cubre iOS Safari Private Mode (SecurityError)
// y QuotaExceededError.
//
// Nivel WARN (no error) porque ~60 callsites legacy quedan boy-scout.
// Subir a 'error' tras migración completa del legacy.
//
// Override desactiva la regla en `safeLocalStorage.js` mismo (es el wrapper
// SSOT, OBVIO que usa raw localStorage internamente) y en tests
// (parser-based tests pueden necesitar grep sobre raw localStorage strings).
const _NO_RAW_LOCALSTORAGE_SELECTOR =
  "CallExpression[callee.object.name='localStorage'][callee.property.name=/^(getItem|setItem|removeItem)$/]"

const _NO_RAW_LOCALSTORAGE_MSG =
  "Usar `safeLocalStorageGet|Set|Remove` (utils/safeLocalStorage.js) en vez de "
  + "localStorage.{get,set,remove}Item raw. iOS Safari Private Mode lanza "
  + "SecurityError y bursts de setItem lanzan QuotaExceededError; el wrapper "
  + "los absorbe. [P2-FRONTEND-LOCALSTORAGE-LINT · 2026-05-23]"

export default defineConfig([
  // [P3-LINT-GATE · 2026-05-30] `dist`/`dev-dist` (artefactos de build) y
  // `scratch` (scripts dev throwaway: checkdb.js, fetch_test.cjs, replace.py…)
  // fuera del lint. scratch usa globals de node/commonjs y NO se shippea —
  // lintearlo solo añadía ~13 errores de ruido que volvían `npm run lint`
  // rojo permanente e inútil como gate de CI.
  // [OPT-FRONTEND · 2026-06-22] `tmp` añadido: dir de scratch UNTRACKED (ej.
  // plan_check.js, harnesses de verificación local) que NO se shippea. Sin
  // ignorarlo aportaba ~114 problemas de ruido (89 `React is not defined`) que
  // enmascaraban el lint del código real (318→204). Mismo criterio que `scratch`.
  // [P2-LINT-ZERO · 2026-07-09] `ds-bundle` añadido: bundle generado del design
  // system (incluye _vendor/react.js compilado) que NO es código fuente del app.
  // Lintearlo aportaba 575 errores de ruido (356 no-undef, 72
  // no-prototype-builtins…) que ahogaban los ~63 errores reales de src/ y
  // volvían `npm run lint` inútil como gate. Mismo criterio que dist/scratch/tmp.
  globalIgnores(['dist', 'dev-dist', 'scratch', 'tmp', 'ds-bundle']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    // [OPT-FRONTEND · 2026-06-22] Plugin `react` registrado SOLO para `jsx-uses-vars`
    // (ver rules). `settings.react.version` evita el warning de auto-detección.
    plugins: { react: reactPlugin },
    settings: { react: { version: 'detect' } },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // [OPT-FRONTEND · 2026-06-22] Marca como "usados" los identificadores
      // referenciados en JSX (`<motion.div>`, `<Componente/>`). NO reporta por sí
      // misma; habilita que `no-unused-vars` (abajo) deje de dar falsos positivos
      // sobre componentes/`motion` usados solo en JSX.
      'react/jsx-uses-vars': 'error',
      // [P3-LINT-GATE · 2026-05-30] Honra la convención `_` del repo para
      // "intencionalmente sin usar": `catch (_e)` / `catch (_lsErr)` y args
      // como `(_, idx)`. ESLint 9 marca por default los bindings de catch
      // sin usar (`caughtErrors: 'all'`); sin estos patrones, los ~50
      // `catch (_e)` defensivos del repo (best-effort localStorage/JSON/abort)
      // salían como error y volvían el gate inútil. varsIgnorePattern conserva
      // el patrón `^[A-Z_]` original (constantes + `_`-prefijados).
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        // `caughtErrors: 'none'` — consistente con `no-empty allowEmptyCatch`:
        // el repo ignora el error capturado en bloques best-effort (localStorage
        // Private Mode, JSON.parse de cache, abort()) de forma deliberada y
        // pervasiva (mezcla `catch (e)` y `catch (_e)`). Flaggearlos solo
        // generaba ruido sin señal real de bug.
        caughtErrors: 'none',
      }],
      // [P3-LINT-GATE · 2026-05-30] El repo usa `try { ... } catch {}` /
      // `catch { /* noop */ }` como patrón best-effort intencional (localStorage
      // en Private Mode, JSON.parse de cache, abort()). allowEmptyCatch evita
      // exigir un comentario en cada uno sin debilitar la detección de bloques
      // vacíos genuinamente sospechosos (if/for/while vacíos siguen siendo error).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // [P2-FRONTEND-LOCALSTORAGE-LINT · 2026-05-23] Tooltip-anchor para
      // tests parser-based que verifican la regla está presente.
      'no-restricted-syntax': [
        'warn',
        {
          selector: _NO_RAW_LOCALSTORAGE_SELECTOR,
          message: _NO_RAW_LOCALSTORAGE_MSG,
        },
      ],
      // [P3-LINT-GATE · 2026-05-30] `only-export-components` es una regla de
      // DX (Fast Refresh en dev): exportar no-componentes junto a componentes
      // rompe HMR, pero NO afecta el build de producción. Varios archivos
      // co-exportan helpers/constantes a propósito (ej. contextos + hooks).
      // Degradado a warn para no bloquear el gate con un concern dev-only.
      'react-refresh/only-export-components': 'warn',
      // [P2-LINT-ZERO · 2026-07-09] Regla nueva de react-hooks v7. Los sitios
      // restantes que la disparan son el patrón legacy "sync inicial de estado
      // externo dentro del effect" (NotificationCenter, ScanMealModal,
      // SupermarketPage, QMeasurements) — funcional pero con un render extra al
      // montar. Los casos de media-query ya migraron al SSOT useMediaQuery
      // (useSyncExternalStore, P2-14). Warn (no error): código nuevo debe
      // preferir useSyncExternalStore / setState-durante-render sancionado;
      // el legacy se migra boy-scout al tocar cada archivo.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // El wrapper SSOT DEBE usar raw localStorage — es el código que la regla
  // existe para evitar duplicar.
  {
    files: ['src/utils/safeLocalStorage.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  // [P3-LINT-GATE · 2026-05-30] Tests (vitest) + parser-based tests que leen
  // el source con node `fs`/`path`/`__dirname`/`require`/`process`. Sin estos
  // globals, eslint marcaba `describe`/`it`/`expect`/`test`/`vi` (vitest) y
  // `fs`/`process`/`__dirname`/`require` (node) como `no-undef` → ~85 errores
  // falsos que volvían el gate inútil. La regla localStorage también se apaga
  // (los tests grepean strings raw de localStorage a propósito).
  {
    files: ['src/__tests__/**', 'e2e/**', '**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: { 'no-restricted-syntax': 'off' },
  },
  // [P3-LINT-GATE · 2026-05-30] Archivos de configuración / build / scripts
  // corren en node (process, __dirname, require, module, console).
  {
    files: [
      '*.config.{js,mjs,cjs}',
      'playwright.config.js',
      'vite.config.js',
      'eslint.config.js',
      'scripts/**',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // [P3-LINT-GATE · 2026-05-30] El service worker (injectManifest) corre en el
  // scope ServiceWorkerGlobalScope: `self`, `clients`, `caches`, `skipWaiting`,
  // `registration`, eventos push/fetch. globals.serviceworker los provee.
  {
    files: ['src/custom-sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
    },
  },
])
