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
  globalIgnores(['dist']),
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
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // [P2-FRONTEND-LOCALSTORAGE-LINT · 2026-05-23] Tooltip-anchor para
      // tests parser-based que verifican la regla está presente.
      'no-restricted-syntax': [
        'warn',
        {
          selector: _NO_RAW_LOCALSTORAGE_SELECTOR,
          message: _NO_RAW_LOCALSTORAGE_MSG,
        },
      ],
    },
  },
  // El wrapper SSOT DEBE usar raw localStorage — es el código que la regla
  // existe para evitar duplicar.
  {
    files: ['src/utils/safeLocalStorage.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  // Tests parser-based ya escanean el source — la regla solo añade ruido.
  {
    files: ['src/__tests__/**', 'e2e/**', '**/*.test.js', '**/*.test.jsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
])
