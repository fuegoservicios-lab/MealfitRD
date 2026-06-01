// [P2-HIST-AUDIT-11 · 2026-05-09] Tests del singleton de caches del
// modal del Historial.
//
// Bug original (audit Historial 2026-05-09):
//   Los 4 caches del modal (lessonsDetail, coherenceHistory,
//   blockedReasons, chunkMetrics) viven en useState locales del
//   componente <History>. Al desmontar, los caches se pierden — un
//   usuario que navega entre History ↔ Dashboard ↔ History dispara
//   los lazy fetches de cero al volver. Tier ultra con N planes
//   archivados: O(N) requests redundantes por sesión.
//
// Fix:
//   Singleton Map por tipo de cache + TTL configurable +
//   `getCachedEntry`/`setCachedEntry`/`hydrateCacheDict` helpers.
//   `useState` en <History> usa lazy init via `hydrateCacheDict`
//   para reconstruir el dict al montar.
//
// Cobertura:
//   1. Set + Get devuelve el mismo array.
//   2. setCachedEntry IGNORA sentinels (no-array) — 'loading'/'error'
//      no deben sobrevivir cross-mount.
//   3. TTL: entry expirado → undefined + se borra del Map.
//   4. TTL=0 hace que `expiresAt` sea null → no expira nunca.
//   5. hydrateCacheDict reconstruye dict desde Map filtrando
//      expirados.
//   6. hydrateCacheDict purga expirados en pasada (limpieza pasiva).
//   7. _resetAllCachesForTests limpia los 4 caches.
//   8. getCachedEntry / setCachedEntry son defensivos contra args
//      null/undefined.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    historyCaches,
    getCachedEntry,
    setCachedEntry,
    setCachedLifetimeEntry,
    hydrateCacheDict,
    clearAllModalCaches,
    setCachedHistoryList,
    getCachedHistoryListStale,
    _resetAllCachesForTests,
} from '../utils/historyCaches';


beforeEach(() => {
    _resetAllCachesForTests();
});


describe('[P2-HIST-AUDIT-11] historyCaches singleton structure', () => {
    it('expone los 4 caches como Maps', () => {
        expect(historyCaches.lessonsDetail).toBeInstanceOf(Map);
        expect(historyCaches.coherenceHistory).toBeInstanceOf(Map);
        expect(historyCaches.blockedReasons).toBeInstanceOf(Map);
        expect(historyCaches.chunkMetrics).toBeInstanceOf(Map);
    });

    it('los 4 caches son objetos distintos (no compartidos por referencia)', () => {
        const set = new Set([
            historyCaches.lessonsDetail,
            historyCaches.coherenceHistory,
            historyCaches.blockedReasons,
            historyCaches.chunkMetrics,
        ]);
        expect(set.size).toBe(4);
    });
});


describe('[P2-HIST-AUDIT-11] setCachedEntry + getCachedEntry', () => {
    it('round-trip básico: set + get devuelve el mismo array', () => {
        const data = [{ id: 'a' }, { id: 'b' }];
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', data);
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan1')).toBe(data);
    });

    it('IGNORA sentinel "loading" (no array)', () => {
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', 'loading');
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan1')).toBeUndefined();
    });

    it('IGNORA sentinel "error"', () => {
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', 'error');
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan1')).toBeUndefined();
    });

    it('IGNORA otros tipos no-array (objeto, número, null)', () => {
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', { foo: 'bar' });
        setCachedEntry(historyCaches.lessonsDetail, 'plan2', 42);
        setCachedEntry(historyCaches.lessonsDetail, 'plan3', null);
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan1')).toBeUndefined();
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan2')).toBeUndefined();
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan3')).toBeUndefined();
    });

    it('defensivo contra cache null/undefined', () => {
        expect(() => setCachedEntry(null, 'plan1', [])).not.toThrow();
        expect(() => setCachedEntry(undefined, 'plan1', [])).not.toThrow();
        expect(getCachedEntry(null, 'plan1')).toBeUndefined();
    });

    it('defensivo contra planId null/undefined', () => {
        expect(() => setCachedEntry(historyCaches.lessonsDetail, null, [])).not.toThrow();
        expect(getCachedEntry(historyCaches.lessonsDetail, null)).toBeUndefined();
    });
});


describe('[P2-HIST-AUDIT-11] TTL behavior', () => {
    it('default TTL (30 min) → entry vive', () => {
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', [{ x: 1 }]);
        // 30 min default es generoso; getCachedEntry devuelve el value.
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan1')).toEqual([{ x: 1 }]);
    });

    it('TTL custom corto (1ms) → expira casi inmediato', async () => {
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', [{ x: 1 }], 1);
        // Esperar > 1ms.
        await new Promise((r) => setTimeout(r, 5));
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan1')).toBeUndefined();
    });

    it('entry expirado se borra del Map al hacer get (limpieza pasiva)', async () => {
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', [{ x: 1 }], 1);
        await new Promise((r) => setTimeout(r, 5));
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan1')).toBeUndefined();
        // Verificar que el Map ya no tiene la key.
        expect(historyCaches.lessonsDetail.has('plan1')).toBe(false);
    });

    it('TTL=0 → expiresAt null → no expira', async () => {
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', [{ x: 1 }], 0);
        // Force a small wait — debería seguir vigente.
        await new Promise((r) => setTimeout(r, 5));
        expect(getCachedEntry(historyCaches.lessonsDetail, 'plan1')).toEqual([{ x: 1 }]);
    });
});


describe('[P2-HIST-AUDIT-11] hydrateCacheDict', () => {
    it('reconstruye dict {planId: array} desde Map', () => {
        setCachedEntry(historyCaches.lessonsDetail, 'a', [{ x: 1 }]);
        setCachedEntry(historyCaches.lessonsDetail, 'b', [{ x: 2 }]);
        const dict = hydrateCacheDict(historyCaches.lessonsDetail);
        expect(dict).toEqual({
            a: [{ x: 1 }],
            b: [{ x: 2 }],
        });
    });

    it('omite entries expirados Y los purga del Map (sweep pasivo)', async () => {
        setCachedEntry(historyCaches.lessonsDetail, 'fresh', [{ x: 1 }]);
        setCachedEntry(historyCaches.lessonsDetail, 'stale', [{ x: 2 }], 1);
        await new Promise((r) => setTimeout(r, 5));
        const dict = hydrateCacheDict(historyCaches.lessonsDetail);
        expect(Object.keys(dict)).toEqual(['fresh']);
        // El stale debe haber sido purgado del Map durante el hydrate.
        expect(historyCaches.lessonsDetail.has('stale')).toBe(false);
        // El fresh sigue vivo.
        expect(historyCaches.lessonsDetail.has('fresh')).toBe(true);
    });

    it('cache vacío → dict vacío', () => {
        expect(hydrateCacheDict(historyCaches.lessonsDetail)).toEqual({});
    });

    it('defensivo contra cache null', () => {
        expect(hydrateCacheDict(null)).toEqual({});
        expect(hydrateCacheDict(undefined)).toEqual({});
    });
});


describe('[P2-HIST-AUDIT-11] _resetAllCachesForTests', () => {
    it('limpia los 4 caches', () => {
        setCachedEntry(historyCaches.lessonsDetail, 'a', [{}]);
        setCachedEntry(historyCaches.coherenceHistory, 'a', [{}]);
        setCachedEntry(historyCaches.blockedReasons, 'a', [{}]);
        setCachedEntry(historyCaches.chunkMetrics, 'a', [{}]);

        _resetAllCachesForTests();

        expect(historyCaches.lessonsDetail.size).toBe(0);
        expect(historyCaches.coherenceHistory.size).toBe(0);
        expect(historyCaches.blockedReasons.size).toBe(0);
        expect(historyCaches.chunkMetrics.size).toBe(0);
    });
});


describe('[P2-HIST-AUDIT-11] cross-cache aislamiento', () => {
    it('escribir a un cache NO afecta a los otros 3', () => {
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', [{ kind: 'lesson' }]);
        expect(historyCaches.lessonsDetail.size).toBe(1);
        expect(historyCaches.coherenceHistory.size).toBe(0);
        expect(historyCaches.blockedReasons.size).toBe(0);
        expect(historyCaches.chunkMetrics.size).toBe(0);
    });
});


describe('[P3-HIST-MODAL-CACHE-XUSER] clearAllModalCaches (logout/user-switch)', () => {
    it('limpia los 5 caches per-plan del modal', () => {
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', [{ kind: 'lesson' }]);
        setCachedEntry(historyCaches.coherenceHistory, 'plan1', [{ a: 1 }]);
        setCachedEntry(historyCaches.blockedReasons, 'plan1', [{ r: 1 }]);
        setCachedEntry(historyCaches.chunkMetrics, 'plan1', [{ m: 1 }]);
        setCachedLifetimeEntry('plan1', { summary: { x: 1 }, history: [] });
        expect(historyCaches.lessonsDetail.size).toBe(1);
        expect(historyCaches.lifetimeLessons.size).toBe(1);

        clearAllModalCaches();

        expect(historyCaches.lessonsDetail.size).toBe(0);
        expect(historyCaches.coherenceHistory.size).toBe(0);
        expect(historyCaches.blockedReasons.size).toBe(0);
        expect(historyCaches.chunkMetrics.size).toBe(0);
        expect(historyCaches.lifetimeLessons.size).toBe(0);
    });

    it('NO toca el cache del LISTADO (lo limpia invalidateHistoryListCache aparte)', () => {
        // Separación de responsabilidades: en _clearUserScopedCaches ambos se
        // invocan, pero clearAllModalCaches solo borra los Maps per-plan del
        // modal — el listado se invalida por su propia vía.
        setCachedHistoryList([{ id: 'p1', name: 'Plan' }]);
        setCachedEntry(historyCaches.lessonsDetail, 'plan1', [{ kind: 'lesson' }]);

        clearAllModalCaches();

        expect(historyCaches.lessonsDetail.size).toBe(0);
        expect(getCachedHistoryListStale()).toEqual([{ id: 'p1', name: 'Plan' }]);
    });
});
