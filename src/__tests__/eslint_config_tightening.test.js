// [F-P2-1 · 2026-05-23] Guard: eslint.config.js declara las reglas
// canónicas del bundle F-P2 + previene regresión a config básica.
//
// Gap original (audit production-readiness 2026-05-23, F-P2-1):
//   eslint.config.js solo declaraba `no-unused-vars` con
//   `varsIgnorePattern: '^[A-Z_]'` muy permisiva. Sin no-console,
//   sin no-debugger, sin eqeqeq, sin no-var → bugs de tipo y debug
//   code residual escapaban a producción.
//
// Fix:
//   Rules añadidas: no-console (warn), no-debugger (error), no-alert (warn),
//   eqeqeq (error), no-var (error), prefer-const (warn). varsIgnorePattern
//   restringido a `^_` (convención canónica underscore-prefix).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _ESLINT_CONFIG = join(__dirname, '..', '..', 'eslint.config.js');

const src = readFileSync(_ESLINT_CONFIG, 'utf8');

describe('F-P2-1: ESLint rules tightening', () => {
    it('A) no-console rule presente con allow para error/trace/assert', () => {
        expect(
            src.includes("'no-console'"),
            'Rule `no-console` ausente — bugs de debug code escapan a prod.',
        ).toBe(true);
        // Debe permitir error/trace para Sentry compatibility.
        expect(
            src.includes("'error'") && src.includes('allow'),
            'no-console NO tiene `allow: ["error", ...]` — strict no-console ' +
            'rompería los console.error legítimos preservados para Sentry.',
        ).toBe(true);
    });

    it('B) no-debugger error rule', () => {
        expect(
            /['"]no-debugger['"]\s*:\s*['"]error['"]/.test(src),
            'Rule `no-debugger: error` ausente — `debugger;` statements ' +
            'olvidados llegan a merge.',
        ).toBe(true);
    });

    it('C) eqeqeq error rule (strict equality)', () => {
        expect(
            src.includes("'eqeqeq'") || src.includes('"eqeqeq"'),
            'Rule `eqeqeq` ausente — coerción type bugs como `0 == ""` ' +
            'pasan sin warning.',
        ).toBe(true);
    });

    it('D) no-var error rule', () => {
        expect(
            /['"]no-var['"]\s*:\s*['"]error['"]/.test(src),
            'Rule `no-var: error` ausente — `var` tiene scope issues en ' +
            'for-loops y closures.',
        ).toBe(true);
    });

    it('E) varsIgnorePattern restringida a `^_`', () => {
        // Pre-fix era `^[A-Z_]` que permitía Components no usados.
        // Post-fix: solo underscore prefix.
        const match = src.match(/varsIgnorePattern\s*:\s*['"]([^'"]+)['"]/);
        expect(match, 'varsIgnorePattern no declarado').not.toBeNull();
        expect(
            match[1],
            `varsIgnorePattern es "${match[1]}" — debería ser "^_". El pattern ` +
            `viejo "^[A-Z_]" permitía Components React no usados pasar sin warning.`,
        ).toBe('^_');
    });

    it('F) anchor F-P2-1 presente en config', () => {
        expect(
            src.includes('F-P2-1'),
            'Anchor F-P2-1 ausente. Sin él, refactor cosmético del config ' +
            'pierde contexto.',
        ).toBe(true);
    });

    it('G) ignores cubren dist, coverage, node_modules', () => {
        // globalIgnores debe excluir output dirs típicos.
        const required = ['dist', 'coverage', 'node_modules'];
        const missing = required.filter((dir) => !src.includes(`'${dir}'`));
        expect(
            missing,
            `eslint config NO ignora dirs: ${missing.join(', ')}. Lint sobre ` +
            `output dirs es CPU waste + falsos positivos en código bundled.`,
        ).toHaveLength(0);
    });
});
