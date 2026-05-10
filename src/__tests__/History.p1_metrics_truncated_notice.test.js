// [P1-HIST-NEW-4 · 2026-05-09] Tests del notice "Mostrando X de N"
// en el tab Métricas cuando el endpoint chunk-metrics aplicó LIMIT 50.
//
// Bug original (audit profundo Historial 2026-05-09):
//   El endpoint `/{plan_id}/chunk-metrics` aplica `LIMIT 50` defensivo.
//   Para planes tier ultra (90 días) con rolling refills + post-swap
//   re-enqueues que dejan completed+failed coexistentes para misma
//   (plan, week) tras P0-HIST-NEW-1, la cardinalidad real puede
//   exceder 50. El frontend renderizaba silently truncado — sin
//   contador, sin notice — y operadores en post-mortem no sabían
//   si veían la lista completa.
//
// Fix:
//   Backend devuelve `total_count` (COUNT separado) + `limit`. Frontend
//   lo guarda en `chunkMetricsMeta` (state paralelo al cache principal,
//   no rompe sentinels existentes) y renderiza un notice azul info al
//   tope del tab Métricas cuando `total_count > chunks.length`.
//
// Cobertura:
//   1. Anchor del marker.
//   2. State `chunkMetricsMeta` declarado.
//   3. _ensureChunkMetrics popula meta tras fetch.
//   4. Render condicional: solo si total_count > chunks.length.
//   5. Lectura defensiva: typeof === 'number' && >= 0.
//   6. CSS class `metricsTruncatedNotice` declarada.
//   7. Tooltip incluye total + limit.
//   8. Comentario load-bearing cita el bug del cap LIMIT 50.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const css = readFileSync(_CSS_PATH, 'utf8');


describe('[P1-HIST-NEW-4] anchor + state setup', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-NEW-4\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(css).toMatch(/\[P1-HIST-NEW-4\s*·\s*2026-05-09\]/);
    });

    it('state chunkMetricsMeta declarado con default {}', () => {
        // State paralelo al cache principal — necesario para no romper
        // los helpers `setCachedEntry` / `hydrateCacheDict` del singleton
        // que asumen array values en `chunkMetricsCache`.
        expect(src).toMatch(
            /\[chunkMetricsMeta,\s*setChunkMetricsMeta\]\s*=\s*useState\(\s*\{\s*\}\s*\)/
        );
    });
});


describe('[P1-HIST-NEW-4] _ensureChunkMetrics popula meta', () => {
    it('lee body.total_count + body.limit con typeof check', () => {
        // Defensivo: typeof === 'number' antes de leer. Si el backend
        // es legacy (pre-P1-HIST-NEW-4) las keys no aparecen y meta
        // queda como undefined → notice no aparece (degrade silente).
        const fetchIdx = src.indexOf('_ensureChunkMetrics');
        expect(fetchIdx).toBeGreaterThan(-1);
        const block = src.slice(fetchIdx, fetchIdx + 3000);
        expect(block).toMatch(/body\.total_count/);
        expect(block).toMatch(/typeof\s+body\.total_count\s*===\s*['"]number['"]/);
        expect(block).toMatch(/body\.limit/);
        expect(block).toMatch(/typeof\s+body\.limit\s*===\s*['"]number['"]/);
    });

    it('setea chunkMetricsMeta solo si AL MENOS uno de los campos viene válido', () => {
        // Si ambos son null (backend legacy o response corrupto),
        // NO actualiza el state — preserva meta previa o queda
        // undefined (notice no aparece). El check es OR: total_count
        // SIN limit ya es señal útil.
        const fetchIdx = src.indexOf('_ensureChunkMetrics');
        const block = src.slice(fetchIdx, fetchIdx + 3500);
        expect(block).toMatch(/_total\s*!==\s*null\s*\|\|\s*_limit\s*!==\s*null/);
    });

    it('NO persiste meta en el singleton historyCaches', () => {
        // El singleton `historyCaches.chunkMetrics` solo debe contener
        // arrays (helpers asumen array values). Meta es derivable en
        // re-fetch — no inflamos el cache singleton con metadata.
        const fetchIdx = src.indexOf('_ensureChunkMetrics');
        const block = src.slice(fetchIdx, fetchIdx + 3500);
        // setCachedEntry para el array sí está, pero NO debe haber
        // un setCachedEntry para meta.
        const cachedEntries = block.match(/setCachedEntry\(/g) || [];
        expect(cachedEntries.length).toBe(1);
    });
});


describe('[P1-HIST-NEW-4] render del notice', () => {
    it('declara _truncated como _adjustedTotal > _list.length', () => {
        // El notice solo aparece cuando el backend reportó total mayor
        // que las filas que el frontend tiene cacheadas.
        // [P0-HIST-FIX-7 · 2026-05-09] El total ahora se ajusta restando
        // chunks fantasma filtrados por week_number > weeks_in_plan
        // (`_adjustedTotal = _totalCount - _filteredOutCount`). El
        // truncado se calcula con `_adjustedTotal` para reflejar el
        // alcance real del plan, no el total crudo del backend.
        const idx = src.indexOf('chunkMetricsMeta[selectedPlan.id]');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 3000);
        expect(block).toMatch(/_truncated\s*=\s*_adjustedTotal\s*!==\s*null[\s\S]{0,200}_adjustedTotal\s*>\s*_list\.length/);
    });

    it('render condicional: skip si _truncated falsy', () => {
        // Anchor único al bloque del notice de truncado (declarado DENTRO
        // del render del tab Métricas, después del map de helpers
        // _fmtDuration / _fmtRelTime / _LM_DISPLAY_GROUPS).
        const idx = src.indexOf('chunkMetricsMeta[selectedPlan.id]');
        const block = src.slice(idx, idx + 3000);
        expect(block).toMatch(/\{_truncated\s*&&\s*\(/);
    });

    it('chip muestra "Mostrando X de Y" con counts del meta + lista', () => {
        // [P0-HIST-FIX-7 · 2026-05-09] Y ahora es `_adjustedTotal`
        // (no `_totalCount`) para reflejar el alcance real del plan
        // tras filtrar chunks fantasma de weeks fuera del plan.
        const idx = src.indexOf('chunkMetricsMeta[selectedPlan.id]');
        const block = src.slice(idx, idx + 3000);
        expect(block).toMatch(/Mostrando\s*\{_list\.length\}\s*de\s*\{_adjustedTotal\}/);
    });

    it('tooltip menciona el cap del backend (LIMIT 50)', () => {
        // Anchor único al bloque del notice de truncado (declarado DENTRO
        // del render del tab Métricas, después del map de helpers
        // _fmtDuration / _fmtRelTime / _LM_DISPLAY_GROUPS).
        const idx = src.indexOf('chunkMetricsMeta[selectedPlan.id]');
        const block = src.slice(idx, idx + 3000);
        // Tooltip explica POR QUÉ está truncado — sin esto el notice
        // sería opaco ("¿por qué solo veo 50?").
        expect(block).toMatch(/_meta\.limit\s*\?\?\s*50/);
    });
});


describe('[P0-HIST-FIX-7] filter de chunks fuera del alcance del plan', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P0-HIST-FIX-7\s*·\s*2026-05-09\]/);
    });

    it('declara _maxValidWeek = ceil(displayTotal / 7)', () => {
        // Plan healthy de 7 días: max week 1.
        // Plan de 8-14 días: max 2. Etc.
        const idx = src.indexOf('[P0-HIST-FIX-7');
        const block = src.slice(idx, idx + 4000);
        expect(block).toMatch(/_maxValidWeek\s*=\s*[\s\S]*?Math\.ceil\([\s\S]*?\/\s*7\s*\)/);
    });

    it('filtra chunks con week_number > _maxValidWeek', () => {
        const idx = src.indexOf('[P0-HIST-FIX-7');
        const block = src.slice(idx, idx + 4000);
        expect(block).toMatch(/c\.week_number\s*<=\s*_maxValidWeek/);
    });

    it('preserva chunks sin week_number numérico (legacy/edge)', () => {
        // Defensivo: row legacy sin week_number debe pasar el filter
        // para no perder data inadvertidamente.
        const idx = src.indexOf('[P0-HIST-FIX-7');
        const block = src.slice(idx, idx + 4000);
        expect(block).toMatch(/typeof\s+c\.week_number\s*!==\s*['"]number['"]\s*\)\s*return\s+true/);
    });

    it('empty state diferenciado: con vs sin chunks fuera de alcance', () => {
        // Si _filteredOutCount > 0 pero _list.length === 0, el modal
        // dice "tiene N chunks pero ninguno corresponde al alcance"
        // — el operator entiende que hay data residual no relevante.
        const idx = src.indexOf('[P0-HIST-FIX-7');
        const block = src.slice(idx, idx + 4500);
        expect(block).toMatch(/_filteredOutCount\s*>\s*0/);
        expect(block).toMatch(/ninguno corresponde al alcance/);
    });

    it('truncated notice usa _adjustedTotal (totalCount - filteredOutCount)', () => {
        // Sin esto, el notice diría "Mostrando 2 de 3" cuando en
        // realidad son 2 de 2 válidos + 1 fantasma — confuso.
        // El cómputo de _adjustedTotal vive en el SEGUNDO marker
        // P0-HIST-FIX-7 (el render del notice), no el primero (el
        // filter).
        const _allMatches = [...src.matchAll(/\[P0-HIST-FIX-7/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const idx = _allMatches[1].index;
        const block = src.slice(idx, idx + 2000);
        expect(block).toMatch(
            /_adjustedTotal\s*=\s*_totalCount\s*!==\s*null[\s\S]{0,200}_totalCount\s*-\s*_filteredOutCount/
        );
    });
});


describe('[P1-HIST-NEW-4] CSS metricsTruncatedNotice', () => {
    it('declara la clase .metricsTruncatedNotice', () => {
        expect(css).toMatch(/\.metricsTruncatedNotice\s*\{/);
    });

    it('estilo info azul (no error rojo, no warning amber)', () => {
        // Notice es informativo (cap defensivo del backend, no error).
        // El palette debe ser azul info — distinguible del modalDetailEmpty
        // genérico al que extiende.
        const idx = css.indexOf('.metricsTruncatedNotice');
        const block = css.slice(idx, idx + 600);
        // Color de fondo azul-pastel (#EFF6FF Tailwind blue-50).
        expect(block).toMatch(/background\s*:\s*#EFF6FF/i);
        // Texto azul oscuro (#1E3A8A).
        expect(block).toMatch(/color\s*:\s*#1E3A8A/i);
    });
});
