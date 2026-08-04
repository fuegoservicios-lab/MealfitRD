// [P1-DASH-WEEK-NAV · 2026-08-04] Tests de la lógica pura de la navegación por
// semanas naturales. Fechas FIJAS: `planWeeks.js` no lee el reloj, así que
// todo aquí es determinista sin mockear timers.
import { describe, it, expect } from 'vitest';
import {
    parseIsoDateLocal,
    buildTimeline,
    projectRemaining,
    groupIntoWeeks,
    chunkCoveringDate,
    resolveDayState,
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

// ─────────────────────────────────────────────────────────────────────────────
// Task 2: estado de cada día. Los fixtures usan la forma REAL que emite el
// backend — durante P2-CHUNK-OVERDUE-SIGNAL tres tests pasaron sobre payloads
// que el productor no puede producir.
// ─────────────────────────────────────────────────────────────────────────────

// Forma REAL de una pausa, medida en produccion (plan 9cf5e313): un chunk
// pausado CONVIVE con varios pendientes; in_flight_count NO es 0.
const PAYLOAD_PAUSA = {
    in_flight_count: 8,
    pending_user_action_count: 1,
    overdue: false,
    overdue_since: null,
    paused_chunks: [{ week: 2, days_offset: 3, days_count: 3, reason_code: 'learning_zero_logs' }],
    upcoming_chunks: [{ week_number: 3, days_offset: 6, days_count: 3, status: 'pending', execute_after: '2026-08-09T14:00:00+00:00' }],
};

describe('[P1-DASH-WEEK-NAV] chunkCoveringDate', () => {
    it('mapea por FECHA desde el primer dia vivo, no por indice global', () => {
        // days[0] = 2026-08-06 ⇒ offset 3 cubre 09, 10, 11
        const c = chunkCoveringDate('2026-08-10', '2026-08-06', PAYLOAD_PAUSA);
        expect(c).toMatchObject({ reason_code: 'learning_zero_logs' });
    });

    it('el chunk pendiente cubre su propio rango', () => {
        const c = chunkCoveringDate('2026-08-13', '2026-08-06', PAYLOAD_PAUSA);
        expect(c).toMatchObject({ status: 'pending' });
    });

    it('fuera de todo rango devuelve null', () => {
        expect(chunkCoveringDate('2026-08-25', '2026-08-06', PAYLOAD_PAUSA)).toBeNull();
    });

    it('empate entre pausado y pendiente lo gana el pausado', () => {
        const solapado = {
            paused_chunks: [{ days_offset: 3, days_count: 3, reason_code: 'x' }],
            upcoming_chunks: [{ days_offset: 3, days_count: 3, status: 'pending' }],
        };
        expect(chunkCoveringDate('2026-08-09', '2026-08-06', solapado)).toMatchObject({ reason_code: 'x' });
    });

    it('payload ausente o campos no numericos no revientan', () => {
        expect(chunkCoveringDate('2026-08-09', '2026-08-06', null)).toBeNull();
        expect(chunkCoveringDate('2026-08-09', null, PAYLOAD_PAUSA)).toBeNull();
        expect(chunkCoveringDate('2026-08-09', '2026-08-06', { upcoming_chunks: [{ days_offset: 'x' }] })).toBeNull();
    });
});

describe('[P1-DASH-WEEK-NAV] resolveDayState', () => {
    const today = new Date(2026, 7, 6);
    const ctx = { chunkStatusInfo: PAYLOAD_PAUSA, firstLiveIso: '2026-08-06', today };
    const entry = (iso, origen, idx = null) => ({ iso, date: parseIsoDateLocal(iso), origen, idx, day: {} });

    it('un dia archivado es pasado: navegable pero NO editable', () => {
        const s = resolveDayState(entry('2026-08-04', 'archivado', 0), ctx);
        expect(s).toMatchObject({ key: 'pasado', navegable: true, editable: false });
    });

    it('el dia de hoy es navegable y editable', () => {
        const s = resolveDayState(entry('2026-08-06', 'vivo', 0), ctx);
        expect(s).toMatchObject({ key: 'hoy', navegable: true, editable: true });
    });

    it('un dia vivo futuro esta listo y es editable', () => {
        const s = resolveDayState(entry('2026-08-07', 'vivo', 1), ctx);
        expect(s).toMatchObject({ key: 'listo', navegable: true, editable: true });
    });

    it('un dia futuro cubierto por un chunk pausado dice pausado, no en proceso', () => {
        const s = resolveDayState(entry('2026-08-10', 'futuro'), ctx);
        expect(s).toMatchObject({ key: 'pausado', navegable: false, editable: false });
    });

    it('un dia futuro cubierto por un chunk pending anuncia cuando se genera', () => {
        const s = resolveDayState(entry('2026-08-13', 'futuro'), ctx);
        expect(s.key).toBe('sin_plan');
        expect(s.label).toMatch(/se genera/i);
    });

    it('SOLO processing afirma actividad; stale NO', () => {
        const info = { upcoming_chunks: [{ days_offset: 1, days_count: 1, status: 'stale' }], in_flight_count: 5 };
        const s = resolveDayState(entry('2026-08-07', 'futuro'), { ...ctx, chunkStatusInfo: info });
        expect(s.key).not.toBe('en_proceso');
    });

    it('processing SI afirma actividad', () => {
        const info = { upcoming_chunks: [{ days_offset: 1, days_count: 1, status: 'processing' }] };
        const s = resolveDayState(entry('2026-08-07', 'futuro'), { ...ctx, chunkStatusInfo: info });
        expect(s.key).toBe('en_proceso');
    });

    it('overdue gana a todo lo demas en un dia sin generar', () => {
        const info = { ...PAYLOAD_PAUSA, overdue: true, overdue_since: '2026-08-05', paused_chunks: [], upcoming_chunks: [] };
        const s = resolveDayState(entry('2026-08-07', 'futuro'), { ...ctx, chunkStatusInfo: info });
        expect(s).toMatchObject({ key: 'atrasado', navegable: false });
    });

    it('overdue NO contamina un dia ya generado', () => {
        const info = { ...PAYLOAD_PAUSA, overdue: true };
        const s = resolveDayState(entry('2026-08-07', 'vivo', 1), { ...ctx, chunkStatusInfo: info });
        expect(s.key).toBe('listo');
    });

    it('sin payload de chunks todo dia no generado queda en sin_plan sin decir cuando', () => {
        const s = resolveDayState(entry('2026-08-20', 'futuro'), { ...ctx, chunkStatusInfo: {} });
        expect(s.key).toBe('sin_plan');
        expect(s.label).not.toMatch(/se genera/i);
    });
});
