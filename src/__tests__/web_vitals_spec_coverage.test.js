// [F-P1-3 · 2026-05-23] Guard que `e2e/web_vitals.spec.js` existe + cubre
// los Web Vitals canónicos (LCP, CLS, FCP, TTFB).
//
// Gap original (audit production-readiness 2026-05-23, F-P1-3):
//   Sin medición de Web Vitals en CI. Una regresión de performance
//   (e.g. import estático de lib pesada que rompe code splitting) NO
//   se detectaba hasta que un usuario reportaba "la app va lenta".
//
// Fix:
//   `e2e/web_vitals.spec.js` mide LCP/CLS/FCP/TTFB via PerformanceObserver
//   contra la home pública + login + register. Verdict PASS/WARN/FAIL
//   contra thresholds Google CRUX oficiales:
//     LCP good ≤ 2500ms, poor > 4000ms
//     CLS good ≤ 0.1, poor > 0.25
//     FCP good ≤ 1800ms, poor > 3000ms
//     TTFB good ≤ 800ms, poor > 1800ms
//
//   Script invocable: `npm run test:web-vitals`.
//
// Por qué un test del spec (no solo el spec en sí):
//   Tests E2E pueden borrarse "por flakiness" o "porque el preview server
//   se cuelga". Sin enforcement parser-based, no hay forma de garantizar
//   que el coverage mínimo persista. Este test ancla la existencia + las
//   métricas canónicas medidas.
//
// Cobertura:
//   A) `e2e/web_vitals.spec.js` existe.
//   B) Spec mide las 4 Web Vitals canónicas (LCP, CLS, FCP, TTFB).
//   C) Spec declara thresholds Google CRUX.
//   D) `package.json` tiene script `test:web-vitals`.
//   E) Anchor `F-P1-3` presente.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _SPEC_PATH = join(__dirname, '..', '..', 'e2e', 'web_vitals.spec.js');
const _PACKAGE_JSON = join(__dirname, '..', '..', 'package.json');

describe('F-P1-3: Web Vitals measurement spec coverage', () => {
    it('A) e2e/web_vitals.spec.js existe', () => {
        expect(
            existsSync(_SPEC_PATH),
            `Spec ausente en ${_SPEC_PATH}. Cierre del gap F-P1-3 perdido. ` +
            `Restaurar desde git history.`,
        ).toBe(true);
    });

    it('B) spec mide las 4 Web Vitals canónicas', () => {
        const src = readFileSync(_SPEC_PATH, 'utf8');
        const requiredMetrics = [
            { name: 'LCP', pattern: /largest-contentful-paint|lcp/i },
            { name: 'CLS', pattern: /layout-shift|cls/i },
            { name: 'FCP', pattern: /first-contentful-paint|fcp/i },
            { name: 'TTFB', pattern: /responseStart|ttfb/i },
        ];
        const missing = requiredMetrics.filter((m) => !m.pattern.test(src));
        expect(
            missing.map((m) => m.name),
            `Spec NO mide Web Vitals: ${missing.map((m) => m.name).join(', ')}. ` +
            `Estos son los 4 críticos del CRUX report — restaurar.`,
        ).toHaveLength(0);
    });

    it('C) spec declara thresholds Google CRUX', () => {
        const src = readFileSync(_SPEC_PATH, 'utf8');
        // Thresholds canónicos: LCP=2500/4000, CLS=0.1/0.25, FCP=1800/3000.
        const required = [
            '2500',  // LCP good
            '4000',  // LCP poor
            '1800',  // FCP good
        ];
        const missing = required.filter((t) => !src.includes(t));
        expect(
            missing,
            `Spec NO declara thresholds CRUX canónicos: ${missing.join(', ')}. ` +
            `Si los thresholds cambiaron oficialmente, actualizar el spec + ` +
            `este test.`,
        ).toHaveLength(0);
    });

    it('D) package.json tiene script `test:web-vitals`', () => {
        const pkg = JSON.parse(readFileSync(_PACKAGE_JSON, 'utf8'));
        expect(
            pkg.scripts?.['test:web-vitals'],
            'Script `test:web-vitals` ausente en package.json. SRE no puede ' +
            'invocar la medición sin recordar el path completo del spec.',
        ).toBeDefined();
        const cmd = pkg.scripts['test:web-vitals'];
        expect(
            cmd.includes('web_vitals.spec') || cmd.includes('web-vitals'),
            `Script test:web-vitals NO invoca el spec correcto. Comando: ${cmd}`,
        ).toBe(true);
    });

    it('E) spec usa Playwright (no lighthouse — decisión documentada)', () => {
        // Lighthouse requiere headless Chrome + flags especiales + tiempo de
        // run >2min. Para smoke baseline, PerformanceObserver via Playwright
        // es suficiente. Si alguien migra a lighthouse, actualizar este test.
        const src = readFileSync(_SPEC_PATH, 'utf8');
        expect(
            src.includes("@playwright/test"),
            'Spec ya NO importa @playwright/test — si migró a lighthouse, ' +
            'actualizar este test + documentar el trade-off (run time).',
        ).toBe(true);
    });

    it('F) anchor F-P1-3 presente en spec', () => {
        const src = readFileSync(_SPEC_PATH, 'utf8');
        expect(
            src.includes('F-P1-3'),
            'Spec perdió anchor `F-P1-3`. Sin breadcrumb, futuro mantenedor ' +
            'pierde contexto del gap cerrado.',
        ).toBe(true);
    });
});
