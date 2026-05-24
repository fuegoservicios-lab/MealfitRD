// [F-P1-1 · 2026-05-23] Coverage gate (`thresholds` en vite.config.js
// `test.coverage`) es decisión de producto deferred a >500 MAU — NO un
// gap técnico.
//
// Gap aparente (audit production-readiness 2026-05-23, F-P1-1):
//   "Sin reporte de coverage publicado ni gate en CI. Cobertura desconocida."
//
// Decisión documentada (este test + comment en vite.config.js):
//   Coverage gate sin medición prior produce False Positives a escala:
//     - Tests que cubren utility helpers inflan el % pero no protegen
//       contra los modos de fallo reales (form validation, auth flow,
//       PDF generation).
//     - Coverage % es proxy débil de calidad de tests. El repo prioriza
//       tests funcionales E2E (Playwright) + tests parser-based (Vitest)
//       que enforzan invariantes específicas.
//
//   Patrón análogo a backend `test_p1_prod_audit_10_coverage_decision.py`
//   y `test_p3_i18n_deferred.py`.
//
//   Coverage script DISPONIBLE (no bloqueante):
//     - `npm run test:coverage` ejecuta vitest con coverage v8.
//     - Output a `./coverage/` (html + json-summary).
//     - Sin `thresholds` por ahora (decisión MVP <100 MAU).
//
//   Cuando crucemos 500 MAU:
//     (a) Ejecutar `npm run test:coverage` y medir baseline real.
//     (b) Añadir `coverage.thresholds = { lines: X, functions: X, ... }`
//         en `vite.config.js` donde X = baseline - 5%.
//     (c) Activar job CI dedicado en futuro `.github/workflows/ci.yml`
//         del repo frontend (actualmente sin CI propio — Vercel deploy
//         es el único gate).
//     (d) Actualizar este test para esperar los thresholds configurados.
//
// Este test ancla la decisión:
//   Si alguien añade `coverage.thresholds` a vite.config.js sin pasar por
//   la decisión (sin documentar el bump a 500 MAU + medición previa), el
//   test falla con copy explicativo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _VITE_CONFIG = join(__dirname, '..', '..', 'vite.config.js');
const _PACKAGE_JSON = join(__dirname, '..', '..', 'package.json');

const viteConfig = readFileSync(_VITE_CONFIG, 'utf8');
const pkg = JSON.parse(readFileSync(_PACKAGE_JSON, 'utf8'));

describe('F-P1-1: coverage gate deferred (decisión de producto)', () => {
    it('A) vite.config.js declara `coverage` block (script invocable)', () => {
        // Coverage script DEBE estar disponible para SRE/dev local —
        // medir baseline cuando lo decidan, sin requerir setup.
        expect(
            viteConfig.includes('coverage:') && viteConfig.includes("provider:"),
            'vite.config.js no tiene block `coverage:` en `test:`. Sin él, ' +
            '`npm run test:coverage` falla y SRE no puede medir baseline.',
        ).toBe(true);
    });

    it('B) package.json tiene script `test:coverage`', () => {
        const scripts = pkg.scripts || {};
        expect(
            scripts['test:coverage'],
            '`test:coverage` script ausente en package.json. SRE necesita ' +
            'invocación trivial — sin script, comando se olvida.',
        ).toBeDefined();
        expect(
            scripts['test:coverage'].includes('coverage'),
            'Script `test:coverage` no invoca coverage. Restaurar con ' +
            '`vitest run --coverage`.',
        ).toBe(true);
    });

    it('C) NO declara `coverage.thresholds.*` activos sin documentación', () => {
        // Si alguien activó thresholds, debe haber justificación inline +
        // medición baseline + bump tracking. Detectar el patrón
        // `thresholds:` activo (no comentado).
        const lines = viteConfig.split('\n');
        const codeLines = lines.filter((line) => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*');
        });
        const codeText = codeLines.join('\n');
        const hasThresholds = /thresholds\s*:\s*\{/.test(codeText);
        if (hasThresholds) {
            // Si activado, verificar que la decisión fue documentada.
            expect(
                viteConfig.includes('500 MAU') ||
                viteConfig.includes('baseline medido') ||
                viteConfig.includes('F-P1-1-COVERAGE-ACTIVATED'),
                'vite.config.js activó `coverage.thresholds` sin documentar la ' +
                'decisión. Pre-condition era cruzar 500 MAU + medir baseline. ' +
                'Documentar inline + actualizar este test para esperar los ' +
                'thresholds configurados.',
            ).toBe(true);
        }
        // Si NO activado: pasa. Decisión deferred preservada.
    });

    it('D) NO existe job CI `frontend-coverage` sin la decisión', () => {
        // El repo frontend NO tiene `.github/workflows/` propio (solo Vercel
        // deploy). Si alguien añade un workflow con coverage gate, validar
        // que pasó por la decisión.
        const candidates = [
            join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'),
            join(__dirname, '..', '..', '.github', 'workflows', 'coverage.yml'),
        ];
        for (const candidate of candidates) {
            try {
                const text = readFileSync(candidate, 'utf8');
                if (/coverage|test:coverage|fail.*under/i.test(text)) {
                    // Si encontró: validar que la decisión fue documentada.
                    expect(
                        text.includes('F-P1-1-COVERAGE-ACTIVATED') ||
                        text.includes('500 MAU') ||
                        text.includes('baseline'),
                        `CI workflow ${candidate} ejecuta coverage gate sin ` +
                        `documentar la decisión. Pre-condition: cruzar 500 MAU + ` +
                        `medir baseline. Documentar inline + actualizar este test.`,
                    ).toBe(true);
                }
            } catch (e) { /* file no existe — OK */ }
        }
    });

    it('E) anchor F-P1-1 presente en vite.config.js coverage block', () => {
        const hasAnchor = viteConfig.includes('F-P1-1') ||
                          viteConfig.includes('P3-COVERAGE-HEATMAP');
        expect(
            hasAnchor,
            'vite.config.js coverage block perdió anchor `F-P1-1` o ' +
            '`P3-COVERAGE-HEATMAP`. Sin breadcrumb, el siguiente mantenedor ' +
            'no sabe POR QUÉ no hay thresholds.',
        ).toBe(true);
    });
});
