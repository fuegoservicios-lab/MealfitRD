// [P1-DASH-WEEK-NAV · 2026-08-04] Tests de la lógica pura de la navegación por
// semanas naturales. Fechas FIJAS: `planWeeks.js` no lee el reloj, así que
// todo aquí es determinista sin mockear timers.
import { describe, it, expect } from 'vitest';
import {
    parseIsoDateLocal,
    buildTimeline,
    projectRemaining,
    groupIntoWeeks,
} from '../utils/planWeeks';

// Helper: plan con `date` estampada en todos los días.
function planWith(archivedIsos, liveIsos, total) {
    return {
        total_days_requested: total,
        _archived_days: archivedIsos.map((iso, i) => ({ date: iso, day_name: `arch${i}`, meals: [] })),
        days: liveIsos.map((iso, i) => ({ date: iso, day_name: `live${i}`, meals: [] })),
    };
}

describe('[P1-DASH-WEEK-NAV] parseIsoDateLocal', () => {
    it('parsea YYYY-MM-DD como medianoche LOCAL, no UTC', () => {
        const d = parseIsoDateLocal('2026-08-05');
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(7);
        expect(d.getDate()).toBe(5);
    });

    it('devuelve null ante basura', () => {
        expect(parseIsoDateLocal('no-es-fecha')).toBeNull();
        expect(parseIsoDateLocal(null)).toBeNull();
        expect(parseIsoDateLocal(undefined)).toBeNull();
    });
});

describe('[P1-DASH-WEEK-NAV] buildTimeline', () => {
    it('une archivados y vivos en orden cronologico marcando su origen', () => {
        const plan = planWith(['2026-08-03'], ['2026-08-04', '2026-08-05'], 30);
        const { ok, entries } = buildTimeline(plan);
        expect(ok).toBe(true);
        expect(entries).toHaveLength(3);
        expect(entries[0]).toMatchObject({ iso: '2026-08-03', origen: 'archivado', idx: 0 });
        expect(entries[1]).toMatchObject({ iso: '2026-08-04', origen: 'vivo', idx: 0 });
        expect(entries[2]).toMatchObject({ iso: '2026-08-05', origen: 'vivo', idx: 1 });
    });

    it('idx de un dia vivo es su posicion en days (es la direccion de escritura)', () => {
        const plan = planWith(['2026-08-01', '2026-08-02'], ['2026-08-03', '2026-08-04'], 30);
        const { entries } = buildTimeline(plan);
        const vivos = entries.filter((e) => e.origen === 'vivo');
        expect(vivos.map((e) => e.idx)).toEqual([0, 1]);
    });

    it('ok=false si CUALQUIER dia carece de date (no se infiere nada)', () => {
        const plan = planWith(['2026-08-03'], ['2026-08-04', '2026-08-05'], 30);
        delete plan.days[1].date;
        expect(buildTimeline(plan).ok).toBe(false);
    });

    it('ok=false si un dia ARCHIVADO carece de date', () => {
        const plan = planWith(['2026-08-03'], ['2026-08-04'], 30);
        delete plan._archived_days[0].date;
        expect(buildTimeline(plan).ok).toBe(false);
    });

    it('ok=false ante plan vacio o shape rara', () => {
        expect(buildTimeline(null).ok).toBe(false);
        expect(buildTimeline({ days: [] }).ok).toBe(false);
        expect(buildTimeline({}).ok).toBe(false);
    });
});

describe('[P1-DASH-WEEK-NAV] projectRemaining', () => {
    it('extiende con dias futuros hasta total_days_requested', () => {
        const { entries } = buildTimeline(planWith([], ['2026-08-03', '2026-08-04'], 5));
        const full = projectRemaining(entries, 5);
        expect(full).toHaveLength(5);
        expect(full.slice(2).map((e) => e.iso)).toEqual(['2026-08-05', '2026-08-06', '2026-08-07']);
        expect(full.slice(2).every((e) => e.origen === 'futuro' && e.idx === null)).toBe(true);
    });

    it('no recorta si ya hay mas dias que el total', () => {
        const { entries } = buildTimeline(planWith([], ['2026-08-03', '2026-08-04'], 1));
        expect(projectRemaining(entries, 1)).toHaveLength(2);
    });

    it('total no numerico no revienta ni inventa dias', () => {
        const { entries } = buildTimeline(planWith([], ['2026-08-03'], 30));
        expect(projectRemaining(entries, undefined)).toHaveLength(1);
    });
});

describe('[P1-DASH-WEEK-NAV] groupIntoWeeks', () => {
    const today = new Date(2026, 7, 6); // jueves 6 ago 2026

    // Jueves→domingo son CUATRO días (J, V, S, D), no tres: 4+7+7+7+5 = 30.
    it('un plan de 30 dias que empieza jueves ocupa 5 semanas de 4+7+7+7+5', () => {
        const { entries } = buildTimeline(planWith([], ['2026-08-06'], 30));
        const weeks = groupIntoWeeks(projectRemaining(entries, 30), today);
        expect(weeks).toHaveLength(5);
        expect(weeks.map((w) => w.cells.filter(Boolean).length)).toEqual([4, 7, 7, 7, 5]);
        expect(weeks.reduce((n, w) => n + w.cells.filter(Boolean).length, 0)).toBe(30);
    });

    it('la primera semana deja huecos en L/M/X cuando el plan empieza jueves', () => {
        const { entries } = buildTimeline(planWith([], ['2026-08-06'], 30));
        const weeks = groupIntoWeeks(projectRemaining(entries, 30), today);
        expect(weeks[0].cells.slice(0, 3)).toEqual([null, null, null]);
        expect(weeks[0].cells[3].iso).toBe('2026-08-06');
    });

    it('un plan que empieza lunes da semanas completas', () => {
        const { entries } = buildTimeline(planWith([], ['2026-08-03'], 14)); // lunes
        const weeks = groupIntoWeeks(projectRemaining(entries, 14), today);
        expect(weeks).toHaveLength(2);
        expect(weeks.every((w) => w.cells.filter(Boolean).length === 7)).toBe(true);
    });

    it('un plan de 7 dias no produce una fila de semanas absurda', () => {
        const { entries } = buildTimeline(planWith([], ['2026-08-06'], 7));
        const weeks = groupIntoWeeks(projectRemaining(entries, 7), today);
        expect(weeks.length).toBeLessThanOrEqual(2);
    });

    it('marca la semana que contiene hoy y cuenta los dias ya generados', () => {
        const { entries } = buildTimeline(planWith(['2026-08-05'], ['2026-08-06'], 30));
        const weeks = groupIntoWeeks(projectRemaining(entries, 30), today);
        expect(weeks[0].hasToday).toBe(true);
        expect(weeks[0].readyCount).toBe(2);
        expect(weeks[1].hasToday).toBe(false);
        expect(weeks[1].readyCount).toBe(0);
    });

    it('el ordinal es 1-based, las semanas van en orden y arrancan en lunes', () => {
        const { entries } = buildTimeline(planWith([], ['2026-08-06'], 30));
        const weeks = groupIntoWeeks(projectRemaining(entries, 30), today);
        expect(weeks.map((w) => w.ordinal)).toEqual([1, 2, 3, 4, 5]);
        expect(weeks.every((w) => w.start.getDay() === 1)).toBe(true);
    });

    it('entradas vacias devuelven lista vacia, no revienta', () => {
        expect(groupIntoWeeks([], today)).toEqual([]);
        expect(groupIntoWeeks(null, today)).toEqual([]);
    });
});
