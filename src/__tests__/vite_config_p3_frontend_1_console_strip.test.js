// [P3-FRONTEND-1 · 2026-05-12] `frontend/vite.config.js` debe strip-ear
// `console.log/warn/debug/info` y `debugger` en builds production via esbuild.
//
// Bug observado (audit 2026-05-11): 141 ocurrencias de console.* en 24
// archivos del frontend src. Muchos legítimos para debug local pero
// terminaban en el bundle público → ofuscaba logs de error reales en
// prod + leak menor de shapes internos en DevTools.
//
// Fix:
//   - `esbuild.drop = ['debugger']` strip de debugger statements.
//   - `esbuild.pure = ['console.log', 'console.warn', 'console.debug',
//     'console.info']` marca como side-effect-free → tree-shaking las
//     elimina cuando el return value no se usa (siempre true para console).
//   - Conditional `mode === 'production'`: en dev/test los logs siguen
//     visibles (debug interactivo + Vitest specs que inspeccionan output).
//   - `console.error` / `console.trace` / `console.assert` preservados —
//     necesarios para post-mortem de bugs reportados por usuario.
//
// Cobertura (regex sobre el source del config):
//   A) `defineConfig` con función `({ mode })` (no objeto plano).
//   B) `esbuild` block presente y gated por `mode === 'production'`.
//   C) `pure` array contiene `'console.log'`, `'console.warn'`,
//      `'console.debug'`, `'console.info'`.
//   D) `pure` array NO contiene `'console.error'` (preservación explícita).
//   E) `drop` array contiene `'debugger'`.
//   F) Anchor `P3-FRONTEND-1` presente en el config.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _VITE_CONFIG = join(__dirname, '..', '..', 'vite.config.js');
const src = readFileSync(_VITE_CONFIG, 'utf8');

describe('P3-FRONTEND-1: vite.config strip console en build prod', () => {
    it('A) defineConfig usa función con `({ mode })`', () => {
        // Necesario para conditional behavior dev vs prod.
        const pattern = /defineConfig\(\s*\(\s*\{\s*mode\s*\}\s*\)\s*=>/;
        expect(pattern.test(src)).toBe(true);
    });

    it('B) esbuild block gated por mode === "production"', () => {
        // Esperamos algo como:
        //   esbuild: mode === 'production' ? { ... } : {}
        // O conditional spread. Ambos patterns aceptados.
        const pattern = /mode\s*===\s*['"]production['"][\s\S]{0,200}esbuild|esbuild\s*:\s*mode\s*===\s*['"]production['"]/;
        expect(pattern.test(src)).toBe(true);
    });

    it('C) pure incluye console.log/warn/debug/info', () => {
        const expected = ['console.log', 'console.warn', 'console.debug', 'console.info'];
        for (const m of expected) {
            const escaped = m.replace(/\./g, '\\.');
            const pattern = new RegExp(`pure[\\s\\S]{0,200}['"\`]${escaped}['"\`]`);
            expect(pattern.test(src)).toBe(true);
        }
    });

    it('D) pure NO incluye console.error (preservación explícita)', () => {
        // Aislar el array `pure: [...]` y verificar que no contiene 'console.error'.
        const pureMatch = src.match(/pure\s*:\s*\[([^\]]+)\]/);
        expect(pureMatch).not.toBeNull();
        const block = pureMatch[1];
        expect(block.includes('console.error')).toBe(false);
    });

    it('E) drop incluye debugger', () => {
        const pattern = /drop[\s\S]{0,200}['"`]debugger['"`]/;
        expect(pattern.test(src)).toBe(true);
    });

    it('F) anchor P3-FRONTEND-1 presente', () => {
        expect(src.includes('P3-FRONTEND-1')).toBe(true);
    });
});
