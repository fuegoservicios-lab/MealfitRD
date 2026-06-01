import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
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
  globalIgnores(['dist', 'dev-dist', 'scratch']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
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
