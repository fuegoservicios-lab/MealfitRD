// [F-P2-6 · 2026-05-23] Guard que `e2e/splash_visual_smoke.spec.js`
// existe + cubre las assertions canónicas.
//
// Gap original (audit production-readiness 2026-05-23, F-P2-6):
//   Splash + loading states presentes pero sin tests visuales → regresión
//   silenciosa (e.g. animación bouncing infinita rompe unmount, splash
//   tarda 30s en desmontar, theme-color cambia accidentalmente).
//
// Fix: e2e/splash_visual_smoke.spec.js con 5 tests (no visual snapshots,
// solo assertions estructurales para evitar flakiness baseline cross-OS).

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _SPEC = join(__dirname, '..', '..', 'e2e', 'splash_visual_smoke.spec.js');

describe('F-P2-6: splash visual smoke spec coverage', () => {
    it('A) spec existe', () => {
        expect(
            existsSync(_SPEC),
            `Spec ausente: ${_SPEC}. Cierre F-P2-6 perdido.`,
        ).toBe(true);
    });

    it('B) spec valida splash unmount post-hydration', () => {
        const src = readFileSync(_SPEC, 'utf8');
        expect(
            src.includes('#pwa-splash') && src.includes('toBeHidden'),
            'Spec NO valida que `#pwa-splash` se oculta tras hydration. ' +
            'Sin esta aserción, splash sticky pasa silencioso.',
        ).toBe(true);
    });

    it('C) spec valida prefers-reduced-motion', () => {
        const src = readFileSync(_SPEC, 'utf8');
        expect(
            src.includes('reducedMotion') || src.includes('reduced-motion'),
            'Spec NO valida prefers-reduced-motion. A11y regression posible.',
        ).toBe(true);
    });

    it('D) spec valida theme-color del meta', () => {
        const src = readFileSync(_SPEC, 'utf8');
        expect(
            src.includes('theme-color'),
            'Spec NO valida theme-color meta. Brand percep regression silenciosa.',
        ).toBe(true);
    });

    it('E) spec valida manifest accesible', () => {
        const src = readFileSync(_SPEC, 'utf8');
        expect(
            src.includes('manifest'),
            'Spec NO valida que /manifest.json responde 200. PWA install prota.',
        ).toBe(true);
    });

    it('F) anchor F-P2-6 presente', () => {
        const src = readFileSync(_SPEC, 'utf8');
        expect(
            src.includes('F-P2-6'),
            'Spec perdió anchor F-P2-6.',
        ).toBe(true);
    });
});
