// [P0-HIST-CACHE-INVALIDATION · 2026-05-09] Tests de invalidación
// del singleton historyCaches en mutaciones del Historial.
//
// Bug original (audit Historial 2026-05-09):
//   Los singletons de cache (lessonsDetailCache, coherenceHistoryCache,
//   blockedReasonsCache, chunkMetricsCache — P2-HIST-AUDIT-11) tienen
//   TTL 30 min y persisten cross-mount del componente <History>. Si
//   un cron del backend transiciona chunks (pending_user_action →
//   completed, processing → failed) mientras la pestaña está dormida
//   en background, al volver el listado muestra el bucket viejo y
//   los tabs del modal devuelven cache stale.
//
// Fix:
//   1. Helper `invalidateCachesForPlan(planId)` exportado del módulo.
//   2. Llamado en handleDeleteConfirm (limpieza), handleRestoreConfirm
//      (chunks cancelados post-restore).
//   3. Listener `visibilitychange` que re-fetchea history y limpia
//      caches del plan abierto si pasaron >60s en background.
//
// Cobertura:
//   - Helper invalidateCachesForPlan exportado.
//   - Borra entries de los 4 caches (lessonsDetail, coherenceHistory,
//     blockedReasons, chunkMetrics) en una sola llamada.
//   - History.jsx importa el helper.
//   - handleDeleteConfirm llama el helper con plan.id.
//   - handleRestoreConfirm llama el helper con planRow.id.
//   - handleEditSave (rename) NO lo llama — los datos siguen válidos.
//   - useEffect de visibilitychange con threshold 60s.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    historyCaches,
    setCachedEntry,
    getCachedEntry,
    invalidateCachesForPlan,
    _resetAllCachesForTests,
} from '../utils/historyCaches';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CACHES_PATH = join(__dirname, '..', 'utils', 'historyCaches.js');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const cachesSrc = readFileSync(_CACHES_PATH, 'utf8');


describe('[P0-HIST-CACHE-INVALIDATION] anchor + helper export', () => {
    it('marker presente en historyCaches.js', () => {
        expect(cachesSrc).toMatch(/\[P0-HIST-CACHE-INVALIDATION\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P0-HIST-CACHE-INVALIDATION\s*·\s*2026-05-09\]/);
    });

    it('invalidateCachesForPlan exportado', () => {
        expect(typeof invalidateCachesForPlan).toBe('function');
    });

    it('History.jsx importa invalidateCachesForPlan', () => {
        const importLine = src.match(
            /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/utils\/historyCaches['"]/
        );
        expect(importLine).toBeTruthy();
        expect(importLine[0]).toMatch(/invalidateCachesForPlan/);
    });
});


describe('[P0-HIST-CACHE-INVALIDATION] semántica del helper', () => {
    beforeEach(() => {
        _resetAllCachesForTests();
    });

    it('borra entries de los 4 caches simultáneamente', () => {
        const planId = 'plan-abc';
        setCachedEntry(historyCaches.lessonsDetail, planId, [{ id: 1 }]);
        setCachedEntry(historyCaches.coherenceHistory, planId, [{ ts: '1' }]);
        setCachedEntry(historyCaches.blockedReasons, planId, [{ chunk_id: 'c1' }]);
        setCachedEntry(historyCaches.chunkMetrics, planId, [{ chunk_id: 'c1' }]);

        // Pre-condition: las 4 entries existen.
        expect(getCachedEntry(historyCaches.lessonsDetail, planId)).toBeTruthy();
        expect(getCachedEntry(historyCaches.coherenceHistory, planId)).toBeTruthy();
        expect(getCachedEntry(historyCaches.blockedReasons, planId)).toBeTruthy();
        expect(getCachedEntry(historyCaches.chunkMetrics, planId)).toBeTruthy();

        invalidateCachesForPlan(planId);

        // Post-condition: las 4 entries borradas.
        expect(getCachedEntry(historyCaches.lessonsDetail, planId)).toBeUndefined();
        expect(getCachedEntry(historyCaches.coherenceHistory, planId)).toBeUndefined();
        expect(getCachedEntry(historyCaches.blockedReasons, planId)).toBeUndefined();
        expect(getCachedEntry(historyCaches.chunkMetrics, planId)).toBeUndefined();
    });

    it('NO toca entries de OTROS planes', () => {
        const planA = 'plan-aaa';
        const planB = 'plan-bbb';
        setCachedEntry(historyCaches.lessonsDetail, planA, [{ id: 1 }]);
        setCachedEntry(historyCaches.lessonsDetail, planB, [{ id: 99 }]);

        invalidateCachesForPlan(planA);

        expect(getCachedEntry(historyCaches.lessonsDetail, planA)).toBeUndefined();
        // El plan B sigue intacto.
        expect(getCachedEntry(historyCaches.lessonsDetail, planB)).toEqual([{ id: 99 }]);
    });

    it('no-op silencioso con planId falsy', () => {
        // No debe lanzar excepción ni mutar caches existentes.
        const planId = 'plan-survivor';
        setCachedEntry(historyCaches.lessonsDetail, planId, [{ id: 1 }]);

        expect(() => invalidateCachesForPlan(null)).not.toThrow();
        expect(() => invalidateCachesForPlan(undefined)).not.toThrow();
        expect(() => invalidateCachesForPlan('')).not.toThrow();

        // El plan-survivor sigue cacheado.
        expect(getCachedEntry(historyCaches.lessonsDetail, planId)).toEqual([{ id: 1 }]);
    });
});


describe('[P0-HIST-CACHE-INVALIDATION] call sites en History.jsx', () => {
    it('handleDeleteConfirm invalida cache del plan eliminado', () => {
        const handlerIdx = src.indexOf('const handleDeleteConfirm');
        expect(handlerIdx).toBeGreaterThan(-1);
        const block = src.slice(handlerIdx, handlerIdx + 2500);
        // Llamada explícita con plan.id (la variable local del handler).
        expect(block).toMatch(/invalidateCachesForPlan\s*\(\s*plan\.id\s*\)/);
    });

    it('handleRestoreConfirm invalida cache del source post-restore', () => {
        const handlerIdx = src.indexOf('const handleRestoreConfirm');
        expect(handlerIdx).toBeGreaterThan(-1);
        const block = src.slice(handlerIdx, handlerIdx + 2500);
        // El handler usa `planRow` (renombrado de confirmRestore).
        expect(block).toMatch(/invalidateCachesForPlan\s*\(\s*planRow\.id\s*\)/);
    });

    it('handleEditSave (rename) NO invalida cache — datos siguen válidos', () => {
        const handlerIdx = src.indexOf('const handleEditSave');
        expect(handlerIdx).toBeGreaterThan(-1);
        const block = src.slice(handlerIdx, handlerIdx + 3500);
        // Rename solo cambia el nombre — lessons/coherence/blocked/
        // metrics son inmutables al rename. Una llamada aquí sería
        // gasto innecesario de re-fetches.
        expect(block).not.toMatch(/invalidateCachesForPlan/);
    });
});


describe('[P0-HIST-CACHE-INVALIDATION] visibilitychange listener', () => {
    it('useEffect registra listener de visibilitychange', () => {
        // Anchor del marker [P0-HIST-VIS-REFRESH].
        expect(src).toMatch(/\[P0-HIST-VIS-REFRESH\s*·\s*2026-05-09\]/);
        // [P0-HIST-VIS-REFRESH] aparece 3 veces (declaración del ref,
        // el useEffect, bump en fetchHistory). Usar `_onVisibilityChange`
        // como anchor — solo aparece dentro del cuerpo del useEffect.
        const useEffectIdx = src.indexOf('_onVisibilityChange');
        expect(useEffectIdx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, useEffectIdx - 800), useEffectIdx + 4500);
        expect(block).toMatch(
            /document\.addEventListener\(\s*['"]visibilitychange['"]/
        );
        // Cleanup en el return del useEffect.
        expect(block).toMatch(
            /document\.removeEventListener\(\s*['"]visibilitychange['"]/
        );
    });

    it('threshold 60s evita disparos por alt-tab rápidos', () => {
        // [P0-HIST-VIS-REFRESH] aparece 3 veces (declaración del ref,
        // el useEffect, bump en fetchHistory). Usar `_onVisibilityChange`
        // como anchor — solo aparece dentro del cuerpo del useEffect.
        // [P1-HISTORY-ABORT · 2026-05-23] Slice back ampliado de 800
        // a 1500 chars: `_STALE_MS = 60 * 1000` está a ~22 líneas
        // (~1100 chars) por encima de `_onVisibilityChange` —
        // separadas por el bloque `_isHistoryDirtySinceLastFetch`
        // + comentarios load-bearing.
        const useEffectIdx = src.indexOf('_onVisibilityChange');
        expect(useEffectIdx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, useEffectIdx - 1500), useEffectIdx + 4500);
        // _STALE_MS = 60 * 1000 (un cron transición típica > 5min).
        expect(block).toMatch(/_STALE_MS\s*=\s*60\s*\*\s*1000/);
        // Guard que retorna sin acción si _stale < _STALE_MS.
        expect(block).toMatch(/_stale\s*<\s*_STALE_MS/);
    });

    it('al disparar, refetchea history + invalida cache del plan abierto', () => {
        // [P0-HIST-VIS-REFRESH] aparece 3 veces (declaración del ref,
        // el useEffect, bump en fetchHistory). Usar `_onVisibilityChange`
        // como anchor — solo aparece dentro del cuerpo del useEffect.
        const useEffectIdx = src.indexOf('_onVisibilityChange');
        expect(useEffectIdx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, useEffectIdx - 800), useEffectIdx + 4500);
        // Re-fetch del listado.
        // [P1-HISTORY-ABORT · 2026-05-23] Call site pasa `{ signal: _vSignal }`.
        expect(block).toMatch(/fetchHistory\(\s*(?:\{[^}]*\})?\s*\)/);
        // Invalidar cache del plan abierto si selectedPlan != null.
        expect(block).toMatch(/selectedPlan\s*&&\s*selectedPlan\.id/);
        expect(block).toMatch(/invalidateCachesForPlan\s*\(\s*selectedPlan\.id\s*\)/);
        // Limpieza también de los 4 useState locales (lessonsDetailCache,
        // coherenceHistoryCache, blockedReasonsCache, chunkMetricsCache).
        expect(block).toMatch(/setLessonsDetailCache/);
        expect(block).toMatch(/setCoherenceHistoryCache/);
        expect(block).toMatch(/setBlockedReasonsCache/);
        expect(block).toMatch(/setChunkMetricsCache/);
    });

    it('useEffect tiene selectedPlan en sus deps (closure correcto)', () => {
        // [P0-HIST-VIS-REFRESH] aparece 3 veces (declaración del ref,
        // el useEffect, bump en fetchHistory). Usar `_onVisibilityChange`
        // como anchor — solo aparece dentro del cuerpo del useEffect.
        const useEffectIdx = src.indexOf('_onVisibilityChange');
        expect(useEffectIdx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, useEffectIdx - 800), useEffectIdx + 4500);
        // Sin esto, el listener captura el undefined inicial y nunca
        // invalida el cache del plan abierto.
        expect(block).toMatch(/\}\s*,\s*\[\s*selectedPlan\s*\]\s*\)/);
    });

    it('fetchHistory bumpea _lastFetchedAtRef.current al éxito', () => {
        // Sin esto, el listener se dispararía en cada vuelta a la
        // pestaña aunque el listado se acabe de cargar.
        // [P1-HISTORY-ABORT · 2026-05-23] Slice ampliado de 3500 a
        // 5000 chars: el body de `fetchHistory` creció con los guards
        // `signal.aborted` antes de cada setter + el catch AbortError
        // + el comentario load-bearing. El bump del ref vive cerca
        // del final del try (~90 líneas dentro del body).
        const fhIdx = src.indexOf('const fetchHistory');
        expect(fhIdx).toBeGreaterThan(-1);
        const block = src.slice(fhIdx, fhIdx + 5000);
        expect(block).toMatch(/_lastFetchedAtRef\.current\s*=\s*Date\.now\(\)/);
    });
});
