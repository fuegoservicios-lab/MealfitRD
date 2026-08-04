// [P1-DASH-WEEK-NAV · 2026-08-04] Lógica PURA de la navegación por semanas
// naturales de "Tu Menú".
//
// QUÉ SUSTITUYE: la fila de días estaba capada a `MAX_WINDOW = 4`
// (utils/planWindow.js) sobre una ventana deslizante de los días vivos, así que
// un plan de 30 días mostraba 4 casillas y no existía forma de llegar al resto.
// No era un scroll roto: no había vista del plan completo.
//
// CONTRATO DE PUREZA: ninguna función aquí lee el reloj (`new Date()` sin
// argumentos / `Date.now()`). La fecha de hoy entra por parámetro para que los
// tests sean deterministas — mismo contrato y misma razón que `planWindow.js`.
//
// LAS FECHAS NO SE INFIEREN. Solo se usa el campo `date` estampado en cada día
// ([P1-CHAT-PAST-DAYS] lo estampa en los 3 sitios de renumeración). Si falta en
// alguno, `buildTimeline` devuelve `ok: false` y el Dashboard degrada a la fila
// de siempre. El backend resuelve fechas con una cascada de 4 tiers
// (`chat_history_context.resolve_day_dates`) y el frontend ya copia una suya
// para el conteo de ciclo: una segunda copia sería la QUINTA aparición de la
// clase de error que mordió cinco veces durante P2-CHUNK-OVERDUE-SIGNAL.
// Degradar es preferible a duplicar.
//
// Tooltip-anchor: P1-DASH-WEEK-NAV. Tests: src/__tests__/planWeeks.test.js.

export const DAY_MS = 24 * 60 * 60 * 1000;

// Iniciales de lunes a domingo, en el orden en que se pintan las columnas.
export const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// `new Date('2026-08-05')` se parsea como MEDIANOCHE UTC; en RD (UTC−4)
// `toLocaleDateString` retrocede un día y el día se vería corrido. Construimos
// la fecha LOCAL a mano.
export function parseIsoDateLocal(value) {
    if (typeof value !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Lunes = 0 … domingo = 6. `getDay()` devuelve domingo = 0, que colocaría el
// domingo al principio de la semana.
export function mondayIndex(date) {
    return (date.getDay() + 6) % 7;
}

export function startOfWeek(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - mondayIndex(d));
    return d;
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

// Línea temporal única: archivados primero, vivos después, cada uno con su
// ORIGEN y su ÍNDICE DENTRO DE SU PROPIA COLECCIÓN.
//
// ⚠️ `idx` de un día vivo es su posición en `plan_data.days`, que es la
// DIRECCIÓN DE ESCRITURA del swap: `/swap-meal/persist` escribe con la ruta
// jsonb `{days,<i>,meals,<j>}`. Nunca mezclar los dos rangos en un índice
// común — el día 0 dejaría de ser `days[0]` y un "Cambiar Plato" reescribiría
// otro día en silencio. El guard vive en `writableDayIndex`, más abajo.
export function buildTimeline(planData) {
    if (!planData || typeof planData !== 'object') return { ok: false, entries: [] };
    const archived = Array.isArray(planData._archived_days) ? planData._archived_days : [];
    const live = Array.isArray(planData.days) ? planData.days : [];
    if (live.length === 0) return { ok: false, entries: [] };

    const entries = [];
    for (let i = 0; i < archived.length; i += 1) {
        const date = parseIsoDateLocal(archived[i]?.date);
        if (!date) return { ok: false, entries: [] };
        entries.push({ iso: toIsoDate(date), date, origen: 'archivado', idx: i, day: archived[i] });
    }
    for (let i = 0; i < live.length; i += 1) {
        const date = parseIsoDateLocal(live[i]?.date);
        if (!date) return { ok: false, entries: [] };
        entries.push({ iso: toIsoDate(date), date, origen: 'vivo', idx: i, day: live[i] });
    }
    entries.sort((a, b) => a.date - b.date);
    return { ok: true, entries };
}

// Extiende la línea temporal con los días que el plan promete y todavía no
// existen. `idx: null` los marca como no direccionables: no hay nada que
// escribir en un día que no se ha generado.
export function projectRemaining(entries, totalDaysRequested) {
    const total = Number.isFinite(totalDaysRequested) ? totalDaysRequested : 0;
    if (!Array.isArray(entries) || entries.length === 0) return [];
    if (total <= entries.length) return entries.slice();

    const out = entries.slice();
    const last = entries[entries.length - 1].date;
    for (let k = 1; k <= total - entries.length; k += 1) {
        const date = new Date(last.getFullYear(), last.getMonth(), last.getDate() + k);
        out.push({ iso: toIsoDate(date), date, origen: 'futuro', idx: null, day: null });
    }
    return out;
}

// Agrupa por semana NATURAL (lunes–domingo). Las semanas parciales dejan `null`
// en las celdas que el plan no cubre: ese hueco es lo que hace visible que la
// semana empieza o termina a medias. Un plan de 30 días que arranca jueves
// ocupa CINCO semanas (3+7+7+7+6), no cuatro.
export function groupIntoWeeks(entries, today) {
    if (!Array.isArray(entries) || entries.length === 0) return [];

    const buckets = new Map();
    for (const entry of entries) {
        const key = toIsoDate(startOfWeek(entry.date));
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(entry);
    }

    const keys = Array.from(buckets.keys()).sort();
    return keys.map((key, i) => {
        const start = parseIsoDateLocal(key);
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
        const cells = new Array(7).fill(null);
        let readyCount = 0;
        let hasToday = false;
        for (const entry of buckets.get(key)) {
            cells[mondayIndex(entry.date)] = entry;
            if (entry.origen !== 'futuro') readyCount += 1;
            if (today && sameDay(entry.date, today)) hasToday = true;
        }
        return { ordinal: i + 1, start, end, cells, hasToday, readyCount };
    });
}
