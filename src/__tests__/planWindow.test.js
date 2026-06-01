// [P3-DASH-WINDOW-TEST · 2026-05-29] Tests CONDUCTUALES (no regex sobre source)
// de la lógica pura de la ventana rolling de días + estado de ciclo, extraída
// de Dashboard.jsx a utils/planWindow.js.
//
// Por qué importa: esta es la aritmética de fechas más frágil del frontend
// (zona horaria, cruce de medianoche, DST, plan incompleto por chunks, fin de
// ciclo) y antes de esta extracción vivía inline en un componente de ~4900
// líneas sin un solo test. Estos tests inyectan fechas fijas y verifican el
// RESULTADO, de modo que una regresión en la aritmética falla en CI.
//
// Nota TZ: los tests construyen fechas con `new Date(y, m-1, d)` (constructor
// local), así que son correctos en cualquier zona horaria donde corra CI —
// igual que el código de producción, que opera siempre en hora local del
// usuario.

import { describe, it, expect } from 'vitest';
import {
    DAY_MS,
    MAX_WINDOW,
    GROCERY_DURATION_DAYS,
    maxDaysFor,
    parseStartLocal,
    daysSinceMidnight,
    computeRollingWindow,
    computeCycleStatus,
    shouldReselectActiveDay,
    resolveActiveDayIndex,
} from '../utils/planWindow';

// Helper: medianoche local de una fecha concreta (paridad con todayDate state).
const localMidnight = (y, m, d) => new Date(y, m - 1, d);

describe('[P3-DASH-WINDOW-TEST] parseStartLocal — parseo TZ-aware', () => {
    it('date-only "YYYY-MM-DD" se parsea como medianoche LOCAL (no UTC)', () => {
        // Esta es LA regresión que cierra GROCERY-START-DATE-LOCAL-PARSE:
        // new Date("2026-05-06") sería UTC midnight → en TZ negativa cae el
        // día 5. El parser debe devolver el día 6 local exacto.
        const dt = parseStartLocal('2026-05-06');
        expect(dt.getFullYear()).toBe(2026);
        expect(dt.getMonth()).toBe(4); // mayo (0-indexed)
        expect(dt.getDate()).toBe(6);
        expect(dt.getHours()).toBe(0);
        expect(dt.getMinutes()).toBe(0);
        expect(dt.getSeconds()).toBe(0);
    });

    it('ISO timestamp completo se normaliza a medianoche local del mismo día', () => {
        const dt = parseStartLocal('2026-05-06T14:37:12.000');
        expect(dt.getFullYear()).toBe(2026);
        expect(dt.getMonth()).toBe(4);
        expect(dt.getDate()).toBe(6);
        expect(dt.getHours()).toBe(0);
        expect(dt.getMinutes()).toBe(0);
    });

    it('valor falsy devuelve una Date (fallback "hoy"), no lanza', () => {
        expect(parseStartLocal(null)).toBeInstanceOf(Date);
        expect(parseStartLocal(undefined)).toBeInstanceOf(Date);
        expect(parseStartLocal('')).toBeInstanceOf(Date);
    });
});

describe('[P3-DASH-WINDOW-TEST] daysSinceMidnight — diferencia en días', () => {
    it('mismo día → 0', () => {
        const a = localMidnight(2026, 5, 6);
        const b = localMidnight(2026, 5, 6);
        expect(daysSinceMidnight(a, b)).toBe(0);
    });

    it('día siguiente → 1, día anterior → -1', () => {
        const today = localMidnight(2026, 5, 7);
        const start = localMidnight(2026, 5, 6);
        expect(daysSinceMidnight(today, start)).toBe(1);
        expect(daysSinceMidnight(start, today)).toBe(-1);
    });

    it('cruce de mes se cuenta correctamente', () => {
        const today = localMidnight(2026, 6, 1); // 1-jun
        const start = localMidnight(2026, 5, 30); // 30-may
        expect(daysSinceMidnight(today, start)).toBe(2);
    });

    it('Math.round colapsa el desfase DST (día de 23h o 25h) al entero correcto', () => {
        // Simulamos un "día" de 23 horas (primavera): la división daría 0.958.
        const start = localMidnight(2026, 5, 6);
        const today23h = new Date(start.getTime() + 23 * 60 * 60 * 1000);
        expect(daysSinceMidnight(today23h, start)).toBe(1);
        // Y un "día" de 25 horas (otoño): división 1.041 → 1.
        const today25h = new Date(start.getTime() + 25 * 60 * 60 * 1000);
        expect(daysSinceMidnight(today25h, start)).toBe(1);
    });

    it('acepta números (ms) además de Date', () => {
        const start = localMidnight(2026, 5, 6).getTime();
        const today = localMidnight(2026, 5, 9).getTime();
        expect(daysSinceMidnight(today, start)).toBe(3);
    });
});

describe('[P3-DASH-WINDOW-TEST] computeRollingWindow — ventana que arranca en hoy', () => {
    it('plan recién creado con solo el chunk 1 (3 días) muestra los 3', () => {
        // Lunes (día 1), planDays.length=3 (chunk 2 aún no persistido).
        const w = computeRollingWindow(3, 0);
        expect(w.todayPlanDayIndex).toBe(0);
        expect(w.visibleStartIndex).toBe(0);
        expect(w.visibleCount).toBe(3); // cap es 4 pero solo hay 3 días
    });

    it('la ventana se ACHICA al cruzar cada día dentro del chunk vivo', () => {
        // Martes (día 2) con 3 días persistidos → [M, Mi] = 2 tabs.
        expect(computeRollingWindow(3, 1).visibleCount).toBe(2);
        // Miércoles (día 3) → [Mi] = 1 tab (último día del chunk 1).
        const w = computeRollingWindow(3, 2);
        expect(w.visibleStartIndex).toBe(2);
        expect(w.visibleCount).toBe(1);
    });

    it('al entrar el chunk siguiente la ventana se EXPANDE hasta el cap (4)', () => {
        // Jueves (día 4) ya con 7 días persistidos → [J,V,S,D] = 4 tabs.
        const w = computeRollingWindow(7, 3);
        expect(w.visibleStartIndex).toBe(3);
        expect(w.visibleEndIndex).toBe(7);
        expect(w.visibleCount).toBe(4);
    });

    it('respeta el cap incluso con muchos días persistidos (plan mensual)', () => {
        const w = computeRollingWindow(30, 0);
        expect(w.visibleCount).toBe(MAX_WINDOW); // 4, no 30
    });

    it('plan atrasado (daysSinceCreation > length) clampa a hoy=último día, sin slice vacío', () => {
        // El refill (triggerShift) aún no entró: 3 días persistidos pero ya
        // pasaron 5. todayPlanDayIndex se clampa a length-1=2.
        const w = computeRollingWindow(3, 5);
        expect(w.todayPlanDayIndex).toBe(2);
        expect(w.visibleStartIndex).toBe(2);
        expect(w.visibleCount).toBe(1); // nunca 0/negativo
    });

    it('daysSinceCreation negativo (reloj adelantado / plan futuro) → hoy=índice 0', () => {
        const w = computeRollingWindow(7, -3);
        expect(w.todayPlanDayIndex).toBe(0);
        expect(w.visibleStartIndex).toBe(0);
        expect(w.visibleCount).toBe(4);
    });

    it('plan vacío (length 0) colapsa todo a 0 sin crash ni slice negativo', () => {
        const w = computeRollingWindow(0, 0);
        expect(w.todayPlanDayIndex).toBe(0);
        expect(w.visibleStartIndex).toBe(0);
        expect(w.visibleCount).toBe(0);
    });

    it('inputs no-finitos (NaN/undefined) degradan a 0 sin propagar NaN', () => {
        const w = computeRollingWindow(NaN, undefined);
        expect(Number.isFinite(w.todayPlanDayIndex)).toBe(true);
        expect(Number.isFinite(w.visibleStartIndex)).toBe(true);
        expect(w.visibleCount).toBe(0);
    });

    it('visibleEndIndex es exclusivo y sirve directo a Array.slice', () => {
        const planDays = Array.from({ length: 7 }, (_, i) => ({ day: i + 1 }));
        const w = computeRollingWindow(planDays.length, 3);
        const sliced = planDays.slice(w.visibleStartIndex, w.visibleEndIndex);
        expect(sliced.map((d) => d.day)).toEqual([4, 5, 6, 7]);
    });
});

describe('[P3-DASH-WINDOW-TEST] computeCycleStatus — días restantes y expiración', () => {
    it('maxDaysFor mapea las 3 duraciones y cae a 7 por default', () => {
        expect(maxDaysFor('weekly')).toBe(7);
        expect(maxDaysFor('biweekly')).toBe(15);
        expect(maxDaysFor('monthly')).toBe(30);
        expect(maxDaysFor('quincenal_typo')).toBe(7);
        expect(maxDaysFor(undefined)).toBe(7);
    });

    it('ciclo recién empezado (día 0): daysLeft=maxDays, no expirado, no finished', () => {
        const s = computeCycleStatus({ groceryDuration: 'weekly', generatedDays: 7, daysSinceCycleStart: 0 });
        expect(s.maxDays).toBe(7);
        expect(s.daysLeft).toBe(7);
        expect(s.isPlanExpired).toBe(false);
        expect(s.planFinished).toBe(false);
    });

    it('último día (daysSinceCycleStart = maxDays-1): daysLeft=1, aún no finished', () => {
        const s = computeCycleStatus({ groceryDuration: 'weekly', generatedDays: 7, daysSinceCycleStart: 6 });
        expect(s.daysLeft).toBe(1);
        expect(s.planFinished).toBe(false);
    });

    it('ciclo cumplido (daysSinceCycleStart = maxDays): daysLeft=0, finished y expirado', () => {
        const s = computeCycleStatus({ groceryDuration: 'weekly', generatedDays: 7, daysSinceCycleStart: 7 });
        expect(s.daysLeft).toBe(0);
        expect(s.planFinished).toBe(true);
        expect(s.isPlanExpired).toBe(true);
    });

    it('GAP 8: plan con generación incompleta NO se marca expirado al llegar a maxDays', () => {
        // Solo 3 de 7 días generados (chunks pendientes). La expiración se
        // extiende por los 4 días faltantes → totalAllowedDays = 11.
        const s = computeCycleStatus({ groceryDuration: 'weekly', generatedDays: 3, daysSinceCycleStart: 7 });
        expect(s.totalAllowedDays).toBe(11);
        expect(s.isPlanExpired).toBe(false); // 7 < 11
        // Pero el contador visible NO se infla: daysLeft sigue contra maxDays.
        expect(s.daysLeft).toBe(0);
        expect(s.planFinished).toBe(true);
    });

    it('plan incompleto expira cuando se cruza la ventana extendida', () => {
        const s = computeCycleStatus({ groceryDuration: 'weekly', generatedDays: 3, daysSinceCycleStart: 11 });
        expect(s.isPlanExpired).toBe(true); // 11 >= 11
    });

    it('biweekly y monthly usan su propio maxDays', () => {
        const bi = computeCycleStatus({ groceryDuration: 'biweekly', generatedDays: 15, daysSinceCycleStart: 10 });
        expect(bi.maxDays).toBe(15);
        expect(bi.daysLeft).toBe(5);

        const mo = computeCycleStatus({ groceryDuration: 'monthly', generatedDays: 30, daysSinceCycleStart: 0 });
        expect(mo.maxDays).toBe(30);
        expect(mo.daysLeft).toBe(30);
    });

    it('inputs no-finitos no propagan NaN', () => {
        const s = computeCycleStatus({ groceryDuration: 'weekly', generatedDays: undefined, daysSinceCycleStart: NaN });
        expect(Number.isFinite(s.daysLeft)).toBe(true);
        expect(Number.isFinite(s.totalAllowedDays)).toBe(true);
        expect(typeof s.isPlanExpired).toBe('boolean');
        expect(typeof s.planFinished).toBe('boolean');
    });
});

describe('[P3-DASH-WINDOW-TEST] shouldReselectActiveDay — auto-select del día actual', () => {
    // Escenario base: ventana visible = índices [3, 4, 5, 6] (start=3, cap=4).
    const START = 3;
    const WIN = 4; // windowEnd = 7 (exclusivo)

    it('día activo DENTRO de la ventana → false (respeta selección manual)', () => {
        expect(shouldReselectActiveDay(3, START, WIN)).toBe(false); // inicio
        expect(shouldReselectActiveDay(5, START, WIN)).toBe(false); // medio
        expect(shouldReselectActiveDay(6, START, WIN)).toBe(false); // último visible
    });

    it('día activo que YA PASÓ (antes del inicio) → true (re-seleccionar hoy)', () => {
        // Caso central: era "hoy", cruzó la medianoche, la ventana avanzó y
        // el día quedó detrás del nuevo inicio.
        expect(shouldReselectActiveDay(2, START, WIN)).toBe(true);
        expect(shouldReselectActiveDay(0, START, WIN)).toBe(true);
    });

    it('día activo más allá del cap de la ventana → true', () => {
        expect(shouldReselectActiveDay(7, START, WIN)).toBe(true); // == windowEnd
        expect(shouldReselectActiveDay(10, START, WIN)).toBe(true);
    });

    it('el borde windowEnd es EXCLUSIVO (windowEnd-1 dentro, windowEnd fuera)', () => {
        expect(shouldReselectActiveDay(6, START, WIN)).toBe(false); // 6 = windowEnd-1
        expect(shouldReselectActiveDay(7, START, WIN)).toBe(true);  // 7 = windowEnd
    });

    it('usa MAX_WINDOW (4) por default cuando no se pasa maxWindow', () => {
        // start=0 → ventana [0,4); índice 4 cae fuera.
        expect(shouldReselectActiveDay(3, 0)).toBe(false);
        expect(shouldReselectActiveDay(4, 0)).toBe(true);
    });

    it('integra con computeRollingWindow: el día de ayer se reselecciona al avanzar', () => {
        // Ayer estaba en el día 2 y era hoy; hoy cruzamos al día 3.
        const w = computeRollingWindow(7, 3); // visibleStartIndex = 3
        // El usuario seguía con activeDayIndex=2 (el "ayer").
        expect(shouldReselectActiveDay(2, w.visibleStartIndex)).toBe(true);
        // Y si estaba viendo un día futuro aún visible (5), no se le mueve.
        expect(shouldReselectActiveDay(5, w.visibleStartIndex)).toBe(false);
    });
});

describe('[P3-DASH-WINDOW-TEST] integración: fecha cruda → ventana (regresión TZ end-to-end)', () => {
    it('grocery_start_date date-only + hoy = mismo día → daysSinceCreation 0 (no pierde día 1)', () => {
        // Reproduce el bug histórico: si daysSinceCreation saliera 1 por el
        // parse UTC, la ventana arrancaría en el día 2 y se "perdería" el día 1.
        const todayMidnight = localMidnight(2026, 5, 6);
        const startMidnight = parseStartLocal('2026-05-06');
        const daysSinceCreation = daysSinceMidnight(todayMidnight, startMidnight);
        expect(daysSinceCreation).toBe(0);

        const w = computeRollingWindow(3, daysSinceCreation);
        expect(w.visibleStartIndex).toBe(0); // arranca en el día 1, intacto
    });

    it('avance natural de 3 días: la ventana se desliza correctamente', () => {
        const startMidnight = parseStartLocal('2026-05-06');
        const planDays = Array.from({ length: 7 }, (_, i) => ({ day: i + 1 }));

        // Día 4 (9-may): debe mostrar días 4..7.
        const today = localMidnight(2026, 5, 9);
        const since = daysSinceMidnight(today, startMidnight);
        expect(since).toBe(3);
        const w = computeRollingWindow(planDays.length, since);
        const visible = planDays.slice(w.visibleStartIndex, w.visibleEndIndex);
        expect(visible.map((d) => d.day)).toEqual([4, 5, 6, 7]);
    });
});

describe('[P3-DASH-WINDOW-TEST] constantes exportadas', () => {
    it('DAY_MS = 86400000 y MAX_WINDOW = 4', () => {
        expect(DAY_MS).toBe(86400000);
        expect(MAX_WINDOW).toBe(4);
    });

    it('GROCERY_DURATION_DAYS expone las 3 duraciones canónicas', () => {
        expect(GROCERY_DURATION_DAYS).toEqual({ weekly: 7, biweekly: 15, monthly: 30 });
    });
});

describe('[P3-DASH-WINDOW-AUTOSELECT] resolveActiveDayIndex — seguir a hoy al finalizar un día', () => {
    const WIN = 4;

    it('día de hoy AVANZA (cruce de medianoche) → salta a hoy aunque el viejo activo siguiera visible', () => {
        // Viernes=4 era hoy y estaba seleccionado; Viernes finaliza → hoy=5 (Sábado).
        // El viejo activo (4) cae fuera de la nueva ventana, pero lo importante es que
        // todayMoved fuerza el salto a 5 SIEMPRE que hoy avanzó.
        const next = resolveActiveDayIndex({
            activeDayIndex: 4, prevTodayPlanDayIndex: 4, todayPlanDayIndex: 5,
            visibleStartIndex: 5, maxWindow: WIN,
        });
        expect(next).toBe(5);
    });

    it('re-index del shift (hoy pasa a índice 0) con activo viejo DENTRO de la nueva ventana → salta a 0', () => {
        // ESTA es la regresión: tras /shift-plan el array se re-indexa (hoy=0). El
        // activeDayIndex viejo (2) queda dentro de [0,4) → shouldReselectActiveDay daría
        // false → ANTES no seguía a hoy. todayMoved (2→0) fuerza el salto a hoy=0.
        const next = resolveActiveDayIndex({
            activeDayIndex: 2, prevTodayPlanDayIndex: 2, todayPlanDayIndex: 0,
            visibleStartIndex: 0, maxWindow: WIN,
        });
        expect(next).toBe(0);
    });

    it('hoy NO se movió y el activo sigue VISIBLE → null (respeta selección manual)', () => {
        // Usuario clickeó un día futuro visible; nada cambió de día → no tocar.
        const next = resolveActiveDayIndex({
            activeDayIndex: 6, prevTodayPlanDayIndex: 4, todayPlanDayIndex: 4,
            visibleStartIndex: 4, maxWindow: WIN,
        });
        expect(next).toBeNull();
    });

    it('hoy NO se movió pero el activo cayó FUERA de la ventana → salta a hoy (red de seguridad)', () => {
        const next = resolveActiveDayIndex({
            activeDayIndex: 1, prevTodayPlanDayIndex: 4, todayPlanDayIndex: 4,
            visibleStartIndex: 4, maxWindow: WIN,
        });
        expect(next).toBe(4);
    });

    it('estado estable (mismo hoy, activo == hoy) → null (no re-render espurio)', () => {
        const next = resolveActiveDayIndex({
            activeDayIndex: 4, prevTodayPlanDayIndex: 4, todayPlanDayIndex: 4,
            visibleStartIndex: 4, maxWindow: WIN,
        });
        expect(next).toBeNull();
    });

    it('primer render (prev=null sentinel) → selecciona hoy por defecto', () => {
        // El ref arranca en null; null !== todayPlanDayIndex → seguir a hoy en el
        // primer effect (selecciona hoy aunque activeDayIndex arrancara en 0).
        const next = resolveActiveDayIndex({
            activeDayIndex: 0, prevTodayPlanDayIndex: null, todayPlanDayIndex: 3,
            visibleStartIndex: 3, maxWindow: WIN,
        });
        expect(next).toBe(3);
    });
});
