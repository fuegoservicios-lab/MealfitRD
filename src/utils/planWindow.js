// [P3-DASH-WINDOW-TEST · 2026-05-29] Lógica PURA de la ventana rolling de días
// y del estado de ciclo del Dashboard. Antes vivía inline en Dashboard.jsx
// (componente de ~4900 líneas) sin un solo test conductual, pese a ser la
// parte con la aritmética de fechas más frágil del frontend: zona horaria,
// cruce de medianoche, DST, plan incompleto (chunks aún generándose) y fin de
// ciclo. Extraerla aquí permite testearla determinísticamente con fechas fijas.
//
// CONTRATO DE PUREZA: estas funciones no leen el reloj (`new Date()` /
// `Date.now()`) salvo el fallback explícito de `parseStartLocal(null)`. Toda
// "fecha de hoy" entra como parámetro (`todayMidnight`) para que los tests
// inyecten fechas fijas y el resultado sea determinístico. `cycleEndMs` /
// `hoursUntilCycleEnd` se quedan inline en Dashboard.jsx justamente porque
// dependen de `Date.now()` y no serían puros.
//
// Tooltip-anchor: P3-DASH-WINDOW-TEST. Tests: src/__tests__/planWindow.test.js.

export const DAY_MS = 1000 * 60 * 60 * 24;

// Cap de tabs visibles. NO es una ventana fija: la ventana se achica al cruzar
// cada día hasta el último día del chunk vivo y se expande hasta este cap
// cuando entra el chunk siguiente. Ver comentario P3-DASH-WINDOW-FROM-TODAY
// en Dashboard.jsx.
export const MAX_WINDOW = 4;

// Días por ciclo de compras según la duración elegida en el assessment.
// Cualquier valor desconocido cae al default semanal (7) — paridad exacta con
// el bloque `let maxDays = 7; if (weekly) ...` original de Dashboard.jsx.
export const GROCERY_DURATION_DAYS = {
    weekly: 7,
    biweekly: 15,
    monthly: 30,
};

export function maxDaysFor(groceryDuration) {
    const v = GROCERY_DURATION_DAYS[groceryDuration];
    return typeof v === 'number' ? v : 7;
}

// [GROCERY-START-DATE-LOCAL-PARSE · 2026-05-06] Parser local-aware.
//
// Bug que cierra: el backend persiste `grocery_start_date` como "YYYY-MM-DD"
// (date-only, sin TZ — ver `_ensure_grocery_start_date` en db_plans.py).
// `new Date("2026-05-06")` se interpreta como UTC midnight → en TZ -4 cae en
// local 2026-05-05T20:00 → `setHours(0,0,0,0)` → local 5-may 00:00. Si hoy es
// local 6-may, daysSinceCreation = 1 → el shift-plan dispara → se PIERDE el
// primer día del plan recién generado.
//
// Fix: si la fecha es solo "YYYY-MM-DD", parsear como local midnight
// directamente (constructor (y, m-1, d) usa la TZ local). Si es un ISO
// timestamp completo, mantener el parse + setHours (convierte el instante a
// la medianoche local de ese día).
export function parseStartLocal(raw) {
    if (!raw) return new Date();
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split('-').map(Number);
        return new Date(y, m - 1, d); // Local midnight
    }
    const dt = new Date(raw);
    dt.setHours(0, 0, 0, 0);
    return dt;
}

// Diferencia en días-calendario entre dos medianoches locales. `Math.round`
// (no floor) es la defensa anti-DST: en el día de cambio de hora un "día" dura
// 23 o 25 h, así que la división da 0.96 o 1.04 → round() lo colapsa al entero
// correcto. Acepta Date o número (ms) — usa coerción numérica como el original.
export function daysSinceMidnight(todayMidnight, startMidnight) {
    return Math.round((Number(todayMidnight) - Number(startMidnight)) / DAY_MS);
}

// Ventana rolling: dado cuántos días tiene el plan persistido y cuántos días
// pasaron desde la creación, calcula qué slice de días mostrar.
//
//   - `todayPlanDayIndex`: índice del día de hoy dentro de planDays, clampeado
//     a [0, length-1]. Si el plan va atrasado (daysSinceCreation supera los
//     días persistidos porque el chunk siguiente aún no entró), el clamp evita
//     apuntar fuera del array; mientras tanto `triggerShift` re-hidrata el plan.
//   - `visibleStartIndex`: por construcción == todayPlanDayIndex (la ventana
//     ARRANCA en hoy y nunca retrocede a días pasados). Se expone aparte para
//     paridad con el código original y porque el render lo usa como base del
//     `globalIdx`.
//   - `visibleEndIndex`: fin EXCLUSIVO del slice (para `planDays.slice`).
//   - `visibleCount`: cuántos tabs se renderizan realmente (acota el cap contra
//     el tamaño real del array → nunca slice "fantasma").
//
// Clamps defensivos: length 0 → todo colapsa a 0 sin crash; daysSinceCreation
// negativo (reloj del usuario adelantado / plan que arranca en el futuro) →
// max(0, ...) lo lleva a hoy=índice 0.
export function computeRollingWindow(planDaysLength, daysSinceCreation, maxWindow = MAX_WINDOW) {
    const len = Number.isFinite(planDaysLength) ? Math.max(0, planDaysLength) : 0;
    const lastIndex = Math.max(0, len - 1);
    const since = Number.isFinite(daysSinceCreation) ? daysSinceCreation : 0;

    const todayPlanDayIndex = Math.max(0, Math.min(since, lastIndex));
    const visibleStartIndex = Math.min(todayPlanDayIndex, lastIndex);
    const visibleEndIndex = visibleStartIndex + maxWindow;
    const visibleCount = Math.max(0, Math.min(len, visibleEndIndex) - visibleStartIndex);

    return { todayPlanDayIndex, visibleStartIndex, visibleEndIndex, visibleCount };
}

// ¿El día actualmente seleccionado quedó FUERA de la ventana visible? Cuando
// un día finaliza y la ventana avanza, el tab que el usuario tenía activo puede
// caer antes del inicio (día ya pasado) o más allá del cap; en ese caso el
// Dashboard re-selecciona el día de hoy. Devuelve solo el booleano de decisión
// (el "a qué día saltar" = todayPlanDayIndex lo aplica el componente) para
// mantener la función pura y trivialmente testeable.
//   - activeDayIndex dentro de [visibleStartIndex, visibleStartIndex+maxWindow)
//     → false (NO tocar: el día sigue visible, respetamos la selección manual).
//   - antes del inicio (ya pasó) o en/después del fin → true (re-seleccionar hoy).
export function shouldReselectActiveDay(activeDayIndex, visibleStartIndex, maxWindow = MAX_WINDOW) {
    const windowEnd = visibleStartIndex + maxWindow;
    return activeDayIndex < visibleStartIndex || activeDayIndex >= windowEnd;
}

// [P3-DASH-WINDOW-AUTOSELECT · 2026-05-30] Decide a qué día saltar tras recalcular
// la ventana. Devuelve el índice a seleccionar, o `null` si NO hay que cambiar la
// selección (se respeta la elección manual del usuario).
//
// Bug que cierra: `shouldReselectActiveDay` solo re-selecciona cuando el día activo
// cae FUERA de la ventana. Pero cuando un día FINALIZA, el Dashboard llama a
// /shift-plan, que re-hidrata el plan RE-INDEXÁNDOLO (hoy pasa a índice 0). Tras ese
// re-index el `activeDayIndex` viejo (p.ej. 2) quedaba DENTRO de la nueva ventana
// [0,4) pero apuntando a OTRO día → out-of-window=false → la selección NO seguía a
// hoy y el usuario tenía que clickear hoy manualmente cada vez que finalizaba un día.
//
// Regla:
//   - `todayMoved` (prevTodayPlanDayIndex !== todayPlanDayIndex): el día de hoy
//     avanzó (cruce de medianoche) o el plan se re-indexó (shift) → SEGUIR a hoy.
//   - si hoy NO se movió pero el día activo cayó fuera de la ventana → hoy
//     (red de seguridad, paridad con el comportamiento previo).
//   - si no, `null` → no tocar (respeta la selección manual de un día visible).
export function resolveActiveDayIndex({
    activeDayIndex,
    prevTodayPlanDayIndex,
    todayPlanDayIndex,
    visibleStartIndex,
    maxWindow = MAX_WINDOW,
}) {
    const todayMoved = prevTodayPlanDayIndex !== todayPlanDayIndex;
    if (todayMoved || shouldReselectActiveDay(activeDayIndex, visibleStartIndex, maxWindow)) {
        return todayPlanDayIndex;
    }
    return null;
}

// Estado del ciclo de compras (independiente de la ventana rolling visual).
//
//   - `maxDays`: días del ciclo según la duración.
//   - `expiryExtension` (GAP 8): si el plan aún no generó todos sus días,
//     extiende la ventana de EXPIRACIÓN por los días faltantes para no marcar
//     expirado un plan que sigue completándose por chunks.
//   - `totalAllowedDays`: maxDays + expiryExtension (umbral de expiración).
//   - `isPlanExpired`: el ciclo inmutable (daysSinceCycleStart) cruzó el umbral.
//   - `daysLeft`: días reales restantes del ciclo. SE CALCULA CONTRA maxDays
//     (no totalAllowedDays) para no inflar el contador visible mientras el plan
//     se genera; clamp a [0, ∞).
//   - `planFinished`: daysLeft === 0 (badge "Finalizado" + CTA reiniciar).
export function computeCycleStatus({ groceryDuration, generatedDays = 0, daysSinceCycleStart }) {
    const maxDays = maxDaysFor(groceryDuration);
    const genDays = Number.isFinite(generatedDays) ? generatedDays : 0;
    const sinceCycle = Number.isFinite(daysSinceCycleStart) ? daysSinceCycleStart : 0;

    const expiryExtension = Math.max(0, maxDays - genDays);
    const totalAllowedDays = maxDays + expiryExtension;
    const isPlanExpired = sinceCycle >= totalAllowedDays;
    const daysLeft = Math.max(0, maxDays - sinceCycle);
    const planFinished = daysLeft === 0;

    return { maxDays, expiryExtension, totalAllowedDays, isPlanExpired, daysLeft, planFinished };
}
