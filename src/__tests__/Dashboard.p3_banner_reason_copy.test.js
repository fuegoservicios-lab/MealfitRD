// [P3-BANNER-REASON-COPY · 2026-07-10] Test parser-based (evita importar Dashboard.jsx completo —
// árbol de dependencias pesado, riesgo de fallo de import ajeno a esta feature).
//
// Bug: `low_band_macro:<macros>` (sufijo DINÁMICO, ej. "low_band_macro:carbs" o
// "low_band_macro:carbs,kcal" tras P2-BAND-GATE-KCAL-SEMANTICS backend) es un exact-match miss en
// Q_DEGRADED_REASON_MAP → SIEMPRE caía al genérico "Calidad por debajo del óptimo" sin decir CUÁL
// macro falló. Forensic corr=d57ffe04 (2026-07-10): el owner vio exactamente este caso (carbs) y
// preguntó qué significaba el banner.
//
// Fix: `resolveQualityDegradedLabel(reason)` — exact-match primero (Q_DEGRADED_REASON_MAP intacto),
// luego prefix-match `low_band_macro:` que nombra los macros específicos que fallaron.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _src = readFileSync(join(__dirname, '..', 'pages', 'Dashboard.jsx'), 'utf-8');

describe('P3-BANNER-REASON-COPY', () => {
    it('exporta el helper resolveQualityDegradedLabel', () => {
        expect(_src).toContain('export function resolveQualityDegradedLabel(reason)');
    });

    it('el helper prueba exact-match antes de prefix-match', () => {
        const i = _src.indexOf('export function resolveQualityDegradedLabel');
        const body = _src.slice(i, i + 900);
        const iExact = body.indexOf('Q_DEGRADED_REASON_MAP[reason]');
        const iPrefix = body.indexOf("reason.startsWith('low_band_macro:')");
        expect(iExact).toBeGreaterThan(-1);
        expect(iPrefix).toBeGreaterThan(-1);
        expect(iExact).toBeLessThan(iPrefix);
    });

    it('mapea los 4 macros a copy legible es-DO', () => {
        const i = _src.indexOf('const LOW_BAND_MACRO_LABELS');
        const block = _src.slice(i, i + 300);
        expect(block).toContain('protein:');
        expect(block).toContain('carbs:');
        expect(block).toContain('fats:');
        expect(block).toContain('kcal:');
    });

    it('el render site inline usa el helper en vez del lookup directo del mapa', () => {
        const i = _src.indexOf("const _label = resolveQualityDegradedLabel(planData._quality_degraded_reason);");
        expect(i).toBeGreaterThan(-1);
    });

    it('el SSOT de notificación (buildQualityNotification) también usa el helper', () => {
        const i = _src.indexOf('const buildQualityNotification');
        const window = _src.slice(i, i + 700);
        expect(window).toContain('resolveQualityDegradedLabel(_reason)');
        expect(window).not.toContain('Q_DEGRADED_REASON_MAP[_reason]');
    });

    it('fallback genérico se preserva para reasons desconocidos', () => {
        const i = _src.indexOf('export function resolveQualityDegradedLabel');
        const body = _src.slice(i, i + 900);
        expect(body).toContain("'Calidad por debajo del óptimo.'");
    });
});
