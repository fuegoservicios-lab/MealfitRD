// [P2-HIST-AUDIT-10 · 2026-05-09] Tests del tab "Métricas" en el
// modal del Historial.
//
// Bug original (audit Historial 2026-05-09):
//   El Historial mostraba bucket de status y tier_breakdown
//   agregado pero NO exponía métricas ricas por chunk
//   (learning_metrics, lag_seconds, duration_ms, was_degraded,
//   learning_repeat_pct). Para diagnosticar por qué un plan
//   archivado se generó "raro" no había vista — solo estaba
//   disponible el chunk-status del plan ACTIVO.
//
// Fix:
//   Endpoint nuevo `/api/plans/{plan_id}/chunk-metrics` y tab
//   "Métricas" en el modal con render compacto por chunk.
//
// Cobertura:
//   1. Anchor del marker.
//   2. Wrapper getPlanChunkMetrics en config/api.js.
//   3. State + helper _ensureChunkMetrics con sentinels.
//   4. Tab "Métricas" se muestra solo si hay chunks completed.
//   5. Lazy fetch al hacer click en el tab.
//   6. Render del list per chunk con stats whitelisted.
//   7. learning_metrics keys whitelisted (NO renderiza pipeline_snapshot).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _API_PATH = join(__dirname, '..', 'config', 'api.js');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');


describe('[P2-HIST-AUDIT-10] anchor + wrapper api', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-10\s*·\s*2026-05-09\]/);
    });

    it('marker presente en config/api.js', () => {
        expect(apiSrc).toMatch(/\[P2-HIST-AUDIT-10\s*·\s*2026-05-09\]/);
    });

    it('getPlanChunkMetrics apunta al endpoint correcto', () => {
        expect(apiSrc).toMatch(
            /export\s+const\s+getPlanChunkMetrics\s*=\s*\(\s*planId\s*\)\s*=>\s*fetchWithAuth\(\s*[`'"]\/api\/plans\/\$\{planId\}\/chunk-metrics[`'"]\s*\)/
        );
    });

    it('History.jsx importa getPlanChunkMetrics', () => {
        const importLine = src.match(
            /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/config\/api['"]/
        );
        expect(importLine[0]).toMatch(/getPlanChunkMetrics/);
    });
});


describe('[P2-HIST-AUDIT-10] state + helper _ensureChunkMetrics', () => {
    it('useState chunkMetricsCache definido', () => {
        // [P2-HIST-AUDIT-11 · 2026-05-09] Cambió de `useState({})`
        // literal a `useState(() => hydrateCacheDict(historyCaches.chunkMetrics))`
        // para persistir cross-mount. Aserción prefix-only — el
        // detalle de la inicialización se cubre en el suite HIST-11.
        expect(src).toMatch(
            /const\s*\[\s*chunkMetricsCache\s*,\s*setChunkMetricsCache\s*\]\s*=\s*useState/
        );
    });

    it('helper _ensureChunkMetrics usa sentinels loading/error', () => {
        // [P1-HIST-NEW-4 · 2026-05-09] Slice ampliado de 1500 → 2500
        // tras inserción del bloque de meta (total_count + limit) entre
        // el setChunkMetricsCache(array) y el catch error.
        const helperIdx = src.indexOf('_ensureChunkMetrics');
        expect(helperIdx).toBeGreaterThan(-1);
        const block = src.slice(helperIdx, helperIdx + 2500);
        expect(block).toMatch(/setChunkMetricsCache\([\s\S]*?['"]loading['"]/);
        expect(block).toMatch(/setChunkMetricsCache\([\s\S]*?['"]error['"]/);
    });

    it('helper omite re-fetch si current ya es array o loading', () => {
        // [P1-HIST-NEW-4 · 2026-05-09] Slice ampliado a 2500.
        const helperIdx = src.indexOf('_ensureChunkMetrics');
        const block = src.slice(helperIdx, helperIdx + 2500);
        expect(block).toMatch(/Array\.isArray\(current\)/);
        expect(block).toMatch(/current\s*===\s*['"]loading['"]/);
    });
});


describe('[P2-HIST-AUDIT-10] tab "Métricas" condicional', () => {
    // [P0-HIST-METRICS-FAILED · 2026-05-09] El invariante original
    // (`_hasMetrics = _completedCount > 0`) ocultaba el tab para
    // planes que se cayeron con TODOS los chunks failed (0 completed,
    // N failed con dead_letter_reason). Cambio: el tab ahora se
    // muestra también si hay failed o recovery_exhausted > 0 — el
    // chunk-metrics endpoint devuelve dead_letter_reason + attempts +
    // escalated_at de chunks failed (LEFT JOIN sin filter por status).
    // Antes ese detalle quedaba invisible para post-mortem.
    it('tab visible si _metricsTabCount > 0 OR _exhaustedCount > 0', () => {
        // _metricsTabCount = _completedCount + _failedCount. Asserción
        // del shape exacto para que un refactor que rompa la unión
        // failed/exhausted falle aquí (drift detection).
        expect(src).toMatch(
            /_metricsTabCount\s*=\s*_completedCount\s*\+\s*_failedCount/
        );
        expect(src).toMatch(
            /_hasMetrics\s*=\s*_metricsTabCount\s*>\s*0\s*\|\|\s*_exhaustedCount\s*>\s*0/
        );
    });

    it('lectura embedded chunk_completed_count + chunk_failed_count + fallback summary', () => {
        const idx = src.indexOf('_hasMetrics');
        // [P0-HIST-METRICS-FAILED · 2026-05-09] Slice ampliado a
        // 4500 chars antes de _hasMetrics: el bloque ahora declara 3
        // counters (completed + failed + exhausted) con sus respectivos
        // fallbacks summary, lo que desplaza `chunk_completed_count`
        // más arriba.
        const block = src.slice(Math.max(0, idx - 4500), idx + 200);
        expect(block).toMatch(
            /typeof\s+selectedPlan\.chunk_completed_count\s*===\s*['"]number['"]/
        );
        expect(block).toMatch(
            /typeof\s+selectedPlan\.chunk_failed_count\s*===\s*['"]number['"]/
        );
        expect(block).toMatch(/chunkStatusSummary\[selectedPlan\.id\]/);
    });

    it('exhaustedCount usa fallback plan_data._recovery_exhausted_chunks para planes legacy', () => {
        // [P0-HIST-METRICS-FAILED · 2026-05-09] Cuando la queue se
        // purgó (planes legacy) pero plan_data sí tiene
        // `_recovery_exhausted_chunks`, el tab debe seguir
        // apareciendo. Asserción del fallback explícito.
        const idx = src.indexOf('_exhaustedCount');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 600);
        expect(block).toMatch(
            /selectedPlan\.plan_data\?\._recovery_exhausted_chunks/
        );
        expect(block).toMatch(/recovery_exhausted_count/);
    });

    it('guard del modalTabs incluye _hasMetrics', () => {
        // El early-return `if (!_hasLessons && !_hasAdjusts && !_hasMetrics)
        // return null` debe estar presente.
        expect(src).toMatch(
            /!_hasLessons\s*&&\s*!_hasAdjusts\s*&&\s*!_hasMetrics/
        );
    });

    it('botón del tab Métricas dispara _ensureChunkMetrics + setActiveModalTab', () => {
        const tabIdx = src.indexOf("setActiveModalTab('metrics')");
        expect(tabIdx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, tabIdx - 200), tabIdx + 600);
        expect(block).toMatch(/_ensureChunkMetrics\(selectedPlan\.id\)/);
    });
});


describe('[P2-HIST-AUDIT-10] render del tab "metrics"', () => {
    it('sentinel loading muestra "Cargando métricas"', () => {
        // El primer match es la className del botón del tab; queremos
        // la SEGUNDA ocurrencia que es el render block del tab body.
        const _allMatches = [...src.matchAll(/activeModalTab === 'metrics'/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const tabIdx = _allMatches[1].index;
        expect(tabIdx).toBeGreaterThan(-1);
        const block = src.slice(tabIdx, tabIdx + 12000);
        expect(block).toMatch(/['"]loading['"]/);
        expect(block).toMatch(/Cargando m[eé]tricas/);
    });

    it('sentinel error muestra mensaje de fallo', () => {
        // El primer match es la className del botón del tab; queremos
        // la SEGUNDA ocurrencia que es el render block del tab body.
        const _allMatches = [...src.matchAll(/activeModalTab === 'metrics'/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const tabIdx = _allMatches[1].index;
        const block = src.slice(tabIdx, tabIdx + 12000);
        expect(block).toMatch(/['"]error['"]/);
        expect(block).toMatch(/No se pudo cargar el detalle/);
    });

    it('lista vacía muestra placeholder específico', () => {
        // El primer match es la className del botón del tab; queremos
        // la SEGUNDA ocurrencia que es el render block del tab body.
        const _allMatches = [...src.matchAll(/activeModalTab === 'metrics'/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const tabIdx = _allMatches[1].index;
        const block = src.slice(tabIdx, tabIdx + 12000);
        expect(block).toMatch(/no tiene m[eé]tricas registradas/);
    });

    it('itera _list.map y renderiza week_number + chunk_kind', () => {
        // [P1-HIST-LM-WHITELIST · 2026-05-09] Slice ampliado a 22000
        // — el bloque del tab Métricas creció con la whitelist
        // categorizada (~600 líneas extras de _LM_DISPLAY_GROUPS +
        // _fmtLmValue helper + render por grupo).
        const _allMatches = [...src.matchAll(/activeModalTab === 'metrics'/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const tabIdx = _allMatches[1].index;
        const block = src.slice(tabIdx, tabIdx + 30000);
        expect(block).toMatch(/_list\.map\s*\(/);
        expect(block).toMatch(/c\.week_number/);
        expect(block).toMatch(/c\.chunk_kind/);
    });

    it('renderiza counters whitelisted (duration, lag/espera, attempts, was_degraded)', () => {
        // [P1-HIST-LM-WHITELIST · 2026-05-09] Slice ampliado.
        // [P0-HIST-FIX-5 · 2026-05-09] Copies humanizadas:
        //   "Lag:" → "Espera:" (es-DO claro, jerga interna oculta)
        //   "Degraded" → "Calidad reducida"
        // Las keys del payload (`metrics.lag_seconds`,
        // `metrics.was_degraded`) NO cambian — solo los labels visibles.
        // [P0-HIST-FIX-7] Slice ampliado a 42000 tras filter de
        // chunks fantasma (week_number > weeks_in_plan).
        const _allMatches = [...src.matchAll(/activeModalTab === 'metrics'/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const tabIdx = _allMatches[1].index;
        const block = src.slice(tabIdx, tabIdx + 42000);
        expect(block).toMatch(/Duraci[oó]n/);
        expect(block).toMatch(/Espera:/);
        expect(block).toMatch(/Intentos/);
        expect(block).toMatch(/Calidad\s+reducida/);
        expect(block).toMatch(/Repetici[oó]n/);
    });

    it('formatea duration_ms < 1000 como "Nms" y >= 1000 como "X.Y s"', () => {
        // [P1-HIST-LM-WHITELIST · 2026-05-09] Slice ampliado.
        const _allMatches = [...src.matchAll(/activeModalTab === 'metrics'/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const tabIdx = _allMatches[1].index;
        const block = src.slice(tabIdx, tabIdx + 30000);
        // Buscar el helper local _fmtDuration con ambos branches.
        expect(block).toMatch(/_fmtDuration/);
        expect(block).toMatch(/ms\s*\/\s*1000/);
        expect(block).toMatch(/toFixed\(1\)/);
    });

    it('badge dead_letter_reason usa tierBadgeBad cuando presente', () => {
        // [P1-HIST-LM-WHITELIST · 2026-05-09] Slice ampliado.
        // [P2-HIST-NEW-4 · 2026-05-09] Re-ampliado a 32000.
        // [P0-HIST-FIX-5 · 2026-05-09] Re-ampliado a 34000.
        // [P0-HIST-FIX-6 · 2026-05-09] Re-ampliado a 39000.
        // [P0-HIST-FIX-7 · 2026-05-09] Re-ampliado a 43000 tras filter
        // de chunks fantasma.
        // [actualizado] Re-ampliado a 48000: el render del tab Métricas
        // creció y el chip dead_letter_reason quedó en offset ~43609.
        const _allMatches = [...src.matchAll(/activeModalTab === 'metrics'/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const tabIdx = _allMatches[1].index;
        const block = src.slice(tabIdx, tabIdx + 48000);
        // Render condicional del dead_letter_reason con clase Bad.
        expect(block).toMatch(/c\.dead_letter_reason/);
        expect(block).toMatch(/styles\.tierBadgeBad/);
    });
});


describe('[P2-HIST-AUDIT-10] learning_metrics keys whitelisted', () => {
    it('whitelist incluye synth_quality_score / synthesized_count / queue_count / recovery_attempts / escalation_reason', () => {
        // [P1-HIST-LM-WHITELIST · 2026-05-09] Las 5 keys originales
        // viven ahora en el grupo "Síntesis y escalación" de
        // _LM_DISPLAY_GROUPS. Slice ampliado para cubrir la
        // categorización completa.
        const _allMatches = [...src.matchAll(/activeModalTab === 'metrics'/g)];
        expect(_allMatches.length).toBeGreaterThanOrEqual(2);
        const tabIdx = _allMatches[1].index;
        const block = src.slice(tabIdx, tabIdx + 30000);
        expect(block).toMatch(/synth_quality_score/);
        expect(block).toMatch(/synthesized_count/);
        expect(block).toMatch(/queue_count/);
        expect(block).toMatch(/recovery_attempts/);
        expect(block).toMatch(/escalation_reason/);
    });

    it('whitelist NO incluye pipeline_snapshot (internals)', () => {
        // [P1-HIST-LM-WHITELIST · 2026-05-09] Anchor migrado de
        // `_LM_DISPLAY_KEYS` (eliminado) a `_LM_DISPLAY_GROUPS`
        // (nueva forma categorizada). El catálogo completo de keys
        // declaradas debe NO contener `pipeline_snapshot` (que sería
        // MB de jsonb si llegara a render).
        const groupsIdx = src.indexOf('_LM_DISPLAY_GROUPS');
        expect(groupsIdx).toBeGreaterThan(-1);
        // Slice cubre todo el catálogo (4 grupos × ~9 keys × ~100 chars).
        const block = src.slice(groupsIdx, groupsIdx + 6000);
        expect(block).not.toMatch(/['"]pipeline_snapshot['"]/);
    });

    it('filtra entries con value null antes del render', () => {
        // [P1-HIST-LM-WHITELIST · 2026-05-09] El filter migró del
        // shape antiguo (`v !== undefined && v !== null`) al nuevo
        // (helper `_fmtLmValue` que devuelve `null` para valores
        // inválidos, seguido de `.filter(Boolean)`). Aserción usa
        // anchor único `_renderedGroups` para localizar el render
        // del bloque LM (los slices basados en `activeModalTab` se
        // quedan cortos al crecer el tab).
        const anchorIdx = src.indexOf('_renderedGroups');
        expect(anchorIdx).toBeGreaterThan(-1);
        const block = src.slice(anchorIdx, anchorIdx + 1500);
        expect(block).toMatch(/_fmtLmValue/);
        expect(block).toMatch(/\.filter\(Boolean\)/);
    });
});
