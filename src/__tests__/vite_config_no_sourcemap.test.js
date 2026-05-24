// [P0-PROD-AUDIT-1 · 2026-05-23] `frontend/vite.config.js` debe declarar
// `build.sourcemap: false` EXPLÍCITO para producción. No basta con el
// default de Vite — un PR futuro podría flippear a `true` o `'inline'`
// silenciosamente.
//
// Gap original (audit production-readiness 2026-05-23, F-P0-1):
//   Stack traces legibles en DevTools si source maps están publicados.
//   Reverse-engineering trivial del bundle (`.js.map` accesible via
//   fetch directo o `view-source:`). Scouting de vulnerabilidades vía
//   anchors P-fix en comments + variables internas + imports sensibles
//   (e.g. `secureFormStorage.js`).
//
// Fix:
//   - `build.sourcemap: false` declarado literalmente en vite.config.js.
//   - Un cambio futuro a `true`/`'inline'`/`'hidden'` requiere PR visible
//     en review (no es silent change vía version bump de Vite).
//   - Si en futuro se necesita upload a Sentry, usar `'hidden'` +
//     `@sentry/vite-plugin` para mantener el contrato "no leak público".
//
// Por qué este test (vs solo declarar el flag):
//   El default de Vite ES `false`, así que un PR podría eliminar el flag
//   sin notar regresión (el comportamiento queda igual). Pero al hacerlo
//   pierde la documentación explícita Y el guardrail para futuros bumps
//   de Vite que cambien el default. Este test ancla el contrato.
//
// Cobertura (regex sobre el source):
//   A) `build:` block presente.
//   B) `sourcemap: false` declarado literal dentro del build block.
//   C) NO existen flips peligrosos: `sourcemap: true|'inline'|'eval'`.
//   D) Anchor `P0-PROD-AUDIT-1` o `F-P0-1` presente.
//
// Tooltip-anchor: P0-PROD-AUDIT-1-NO-SOURCEMAP | audit 2026-05-23.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _VITE_CONFIG = join(__dirname, '..', '..', 'vite.config.js');
const src = readFileSync(_VITE_CONFIG, 'utf8');

describe('P0-PROD-AUDIT-1: vite.config no source maps en producción', () => {
    it('A) build block presente en defineConfig', () => {
        // Pattern: `build: {` o `build:{` dentro del config.
        const pattern = /build\s*:\s*\{/;
        expect(pattern.test(src)).toBe(true);
    });

    it('B) sourcemap: false declarado literal', () => {
        // Permite spacing variado pero exige el literal `false`.
        const pattern = /sourcemap\s*:\s*false/;
        expect(
            pattern.test(src),
            'vite.config.js NO declara `sourcemap: false` literal. Default ' +
            'de Vite es false PERO sin declaración explícita un PR futuro ' +
            'podría flippear silenciosamente. Restaurar el flag.'
        ).toBe(true);
    });

    it('C) NO declara sourcemap: true / "inline" / "eval"', () => {
        // Defensive: si alguien flippeó el flag a producción-leak.
        const dangerousPatterns = [
            /sourcemap\s*:\s*true/,
            /sourcemap\s*:\s*['"`]inline['"`]/,
            /sourcemap\s*:\s*['"`]eval['"`]/,
        ];
        for (const pattern of dangerousPatterns) {
            expect(
                pattern.test(src),
                `vite.config.js declara sourcemap con valor peligroso ` +
                `(matched: ${pattern}). Esto publica maps en producción → ` +
                `information leak (stack traces, código source, anchors ` +
                `P-fix). Si necesitas debugging real, usar 'hidden' + ` +
                `upload a Sentry via @sentry/vite-plugin. Ver follow-up ` +
                `P1-SENTRY-SOURCE-MAPS en el comment del flag.`
            ).toBe(false);
        }
    });

    it('D) anchor P0-PROD-AUDIT-1 o F-P0-1 presente', () => {
        // Ancla operacional para drift detection: si alguien borra el
        // bloque comentario sin tocar el flag, el contexto se pierde.
        const hasAnchor = src.includes('P0-PROD-AUDIT-1') || src.includes('F-P0-1');
        expect(
            hasAnchor,
            'vite.config.js perdió el anchor `P0-PROD-AUDIT-1` o `F-P0-1` ' +
            'que documenta POR QUÉ sourcemap es false. Sin anchor, un ' +
            'refactor cosmético podría borrar el comentario y el siguiente ' +
            'mantenedor no entiende el contexto.'
        ).toBe(true);
    });
});
