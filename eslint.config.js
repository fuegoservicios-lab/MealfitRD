import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// [F-P2-1 · 2026-05-23] Reglas adicionales sobre la baseline de
// `js.configs.recommended` + react-hooks + react-refresh.
//
// Audit production-readiness 2026-05-23 flageó ESLint config como "básica
// — sin no-console, sin detección de imports cíclicos, varsIgnorePattern
// muy permisiva". Cierre incremental:
//
//   - `no-console: warn` para `log/warn/debug/info` (vite.config.js los
//     stripea en build prod via esbuild `pure: [...]` por P3-FRONTEND-1,
//     PERO el warn ayuda a no introducir nuevos en dev). `error/trace/
//     assert` exemptos — preservados en prod para Sentry.
//
//   - `no-debugger: error` (vite también dropea `debugger` statements
//     en prod, pero error en lint evita merges con debugger olvidados).
//
//   - `no-alert: warn` — alerts bloquean UX y son síntoma de
//     debugging-style code. Sonner (toast lib) ya es la alternativa.
//
//   - `eqeqeq: ['error', 'always']` — forzar `===` / `!==`. Evita
//     bugs de coerción tipo `0 == ''` (true) o `null == undefined` (true).
//
//   - `no-var: error` — `let`/`const` solo. Var has block-scope issues
//     conocidas en for-loops y closures.
//
//   - `varsIgnorePattern: '^_'` — tighter que el `^[A-Z_]` legacy
//     (que ignoraba React components no-usados). El underscore prefix
//     es convención canónica de "intencionalmente no usado".
//
// Follow-up `P3-ESLINT-IMPORT-CYCLE`: requiere añadir
// `eslint-plugin-import` como dep — out of scope de este P2.
//
// Tooltip-anchor: F-P2-1-ESLINT-TIGHTEN | audit 2026-05-23.
//
// NOTE: muchas de estas reglas tienen violations pre-existentes en el
// codebase (CI doc P2-LIVE-1 reporta "245 errores eslint + 13 warnings"
// antes de mi cambio). El job CI `frontend-lint` es non-blocking
// (continue-on-error: true), así que estas reglas SUMAN ruido a la
// telemetría sin bloquear merges hasta que se haga cleanup incremental.
export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules', '.vercel']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // [F-P2-1] Restringido de `^[A-Z_]` a `^_`. Underscore prefix es
      // la convención canónica para "ignorado intencionalmente". Pattern
      // viejo permitía Components React no usados (e.g. `Foo` no usado)
      // pasar sin warning.
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // [F-P2-1] Telemetría — warn sobre console.log/warn/debug/info.
      // error/trace/assert exemptos (preservados en prod para Sentry,
      // ver vite.config.js P3-FRONTEND-1).
      'no-console': ['warn', { allow: ['error', 'trace', 'assert', 'warn'] }],
      // [F-P2-1] debugger statements son siempre regresión — vite los
      // dropea en prod pero error en lint evita merges accidentales.
      'no-debugger': 'error',
      // [F-P2-1] alert/confirm/prompt son síntoma de quick-and-dirty
      // debugging. Sonner es la lib canónica de notifications.
      'no-alert': 'warn',
      // [F-P2-1] Forzar comparación strict === / !==. Evita coerción
      // bug-prone.
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      // [F-P2-1] var → let/const. Bloqueo scope correcto, prevent
      // closure capture bugs en for-loops.
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
])
