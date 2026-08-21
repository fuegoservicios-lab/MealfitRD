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

// [P1-I18N-UTILS-ETIQUETAS · 2026-08-21] `t` entra como `_t` y NO se invoca aquí
// arriba: es solo el VALOR POR DEFECTO de las funciones de abajo. Sirve para que
// un call site que todavía no pasa su propia función de traducción siga leyendo
// el catálogo ACTIVO en vez de quedarse clavado en español — el alias con guion
// bajo además lo deja fuera del extractor textual de claves, que solo reconoce la
// llamada escrita con el nombre desnudo.
import { formatDate, t as _t } from '../i18n';

export const DAY_MS = 24 * 60 * 60 * 1000;

// Abreviaturas de lunes a domingo, en el orden en que se pintan las columnas.
//
// ⚠️ TRES letras, no una. Con iniciales sueltas el owner reportó que "M" no se
// lee como martes y que "X" para miércoles se entiende todavía menos — son
// convención de calendario impreso, no algo que nadie descifre de un vistazo.
// El ancho de la celda da de sobra para tres caracteres.
//
// [P1-I18N-UTILS-ETIQUETAS · 2026-08-21] FUNCIÓN y no constante, y no es estilo:
// un array de etiquetas traducidas evaluado AL IMPORTAR corre antes de que exista
// el catálogo y se congela en español para siempre — y en es-DO parece correcto,
// así que sobrevive a cualquier revisión visual. Las siete cadenas van LITERALES
// dentro de la función porque el extractor de claves es textual: una cadena
// pasada por variable no se puede recolectar y el idioma nunca la vería.
export function getWeekdayLabels(tFn) {
    const t = typeof tFn === 'function' ? tFn : _t;
    return [t('Lun'), t('Mar'), t('Mié'), t('Jue'), t('Vie'), t('Sáb'), t('Dom')];
}

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
// ocupa CINCO semanas (4+7+7+7+5), no cuatro: de jueves a domingo hay cuatro
// días, no tres.
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

// ─────────────────────────────────────────────────────────────────────────────
// Estado de un día. Hereda íntegra la jerarquía de P0-DASH-CHIP-HONESTY tal
// como la dejó P2-CHUNK-OVERDUE-SIGNAL:
//
//   atrasado > pausado > en proceso > programado
//
// y su regla dura: NINGUNA etiqueta afirma actividad si nada corre. Solo un
// chunk en `processing` dice "en proceso". `stale` NO: es un chunk encolado
// esperando que el worker lo re-pickee, y `in_flight_count` lo suma — por eso
// el estado se decide por EL CHUNK QUE CUBRE ESE DÍA y nunca por contadores
// globales. Esa distinción costó dos rondas de revisión; no la colapses.
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ `days_offset` es relativo a la VENTANA VIVA post-shift (el backend lo
// calcula como `len(shifted_days)` en los chunks de catch-up), NO a la posición
// absoluta del plan. Confundirlo ya produjo un "+11 días" donde la verdad eran
// 9. Por eso el mapeo va por FECHA: un chunk cubre `fecha(days[0]) +
// days_offset + k`, con k en [0, days_count).
export function chunkCoveringDate(iso, firstLiveIso, chunkStatusInfo) {
    const target = parseIsoDateLocal(iso);
    const anchor = parseIsoDateLocal(firstLiveIso);
    if (!target || !anchor || !chunkStatusInfo) return null;

    const offsetDays = Math.round((target - anchor) / DAY_MS);
    const paused = Array.isArray(chunkStatusInfo.paused_chunks) ? chunkStatusInfo.paused_chunks : [];
    const upcoming = Array.isArray(chunkStatusInfo.upcoming_chunks) ? chunkStatusInfo.upcoming_chunks : [];

    const covers = (c) => {
        const start = Number(c?.days_offset);
        const count = Number(c?.days_count);
        if (!Number.isFinite(start) || !Number.isFinite(count)) return false;
        return offsetDays >= start && offsetDays < start + count;
    };

    // El pausado gana el empate: un día bloqueado esperando al usuario no debe
    // anunciar la hora de otro chunk. `paused_chunks` no trae `status` (el
    // backend lo omite porque la lista ya lo implica), así que lo añadimos aquí
    // para que el consumidor tenga una sola forma que mirar.
    const hit = paused.find(covers);
    if (hit) return { ...hit, status: 'pending_user_action' };
    return upcoming.find(covers) || null;
}

// [P1-HIST-PANEL-FECHA-I18N · 2026-08-20] El nombre queda por compatibilidad de
// call sites, pero ya NO es «Es»: `formatDate` lee el locale activo.
function formatDayEs(date) {
    return formatDate(date, { weekday: 'long' });
}

// Devuelve `label` (frase completa, para el `aria-label` y para la etiqueta de
// la SEMANA) y `short` (marca compacta de la celda del día).
//
// ⚠️ La celda usa `short` y NUNCA `label`. La fila anterior repetía "se genera
// vie" en cada uno de los cuatro días — la queja original del owner. La fecha
// del lote se dice UNA vez, a nivel de semana; en la celda solo cabe una marca.
//
// [P1-I18N-UTILS-ETIQUETAS · 2026-08-21] El tercer parámetro es la función de
// traducción. `key` NO se traduce JAMÁS: es un identificador que el consumidor
// compara (`st.key !== 'listo'` en PlanWeekNav) y que los tests fijan. Lo que se
// traduce es lo que se LEE — `label` y `short`.
export function resolveDayState(entry, ctx, tFn) {
    // ⚠️ `|| {}` y NO un default de destructuring: el Dashboard arranca con
    // `chunkStatusInfo = null` (no `undefined`) hasta que responde
    // `/chunk-status`, y un default solo cubre `undefined`.
    const { firstLiveIso, today } = ctx || {};
    const chunkStatusInfo = (ctx && ctx.chunkStatusInfo) || {};
    // Se llama `t` a secas a propósito: el extractor de claves reconoce la
    // llamada por el NOMBRE, así que un alias la volvería invisible para el
    // catálogo. Y va dentro de la función, nunca en ámbito de módulo.
    const t = typeof tFn === 'function' ? tFn : _t;

    if (entry.origen === 'archivado') {
        return { key: 'pasado', label: t('ya pasó'), short: '✓', navegable: true, editable: false };
    }
    if (entry.origen === 'vivo') {
        const hoy = today && new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (hoy && entry.date.getTime() === hoy.getTime()) {
            return { key: 'hoy', label: t('hoy'), short: t('hoy'), navegable: true, editable: true };
        }
        return { key: 'listo', label: t('listo'), short: t('listo'), navegable: true, editable: true };
    }

    // origen === 'futuro': el día no existe todavía. `overdue` solo puede
    // aplicar aquí — un día ya generado nunca está atrasado.
    if (chunkStatusInfo.overdue === true) {
        return { key: 'atrasado', label: t('atrasado'), short: t('atrasado'), navegable: false, editable: false };
    }

    const chunk = chunkCoveringDate(entry.iso, firstLiveIso, chunkStatusInfo);
    if (chunk?.status === 'pending_user_action') {
        return { key: 'pausado', label: t('pausado'), short: t('pausado'), navegable: false, editable: false };
    }
    if (chunk?.status === 'processing') {
        return { key: 'en_proceso', label: t('en proceso'), short: t('en proceso'), navegable: false, editable: false };
    }
    if (chunk) {
        const when = parseIsoDateLocal(String(chunk.execute_after || '').slice(0, 10));
        // El día de la semana entra INTERPOLADO y no concatenado: en otras
        // lenguas el nombre del día no cae al final de la frase, y una
        // concatenación fija ese orden para siempre.
        return {
            key: 'sin_plan',
            label: when ? t('se genera {dia}', { dia: formatDayEs(when) }) : t('en cola'),
            short: t('en cola'),
            navegable: false,
            editable: false,
        };
    }
    return { key: 'sin_plan', label: t('aún sin plan'), short: '·', navegable: false, editable: false };
}

// [P1-DASH-WEEK-NAV] LA regla que impide corromper datos.
//
// `activeDayIndex` nunca fue solo selección visual: es la DIRECCIÓN DE
// ESCRITURA. Viaja al backend en `{ dayIndex, mealIndex, … }` y
// `/swap-meal/persist` escribe con la ruta jsonb `{days,<i>,meals,<j>}`; lo
// mismo `regenerateDay(dayIndex, …)`. Ver P2-SWAP-INDEX-COUPLING en Dashboard.
//
// Con la navegación por semanas la vista también muestra días ARCHIVADOS, que
// viven en `_archived_days` y tienen su PROPIO rango de índices. Si los dos
// rangos se mezclaran, el índice 0 dejaría de ser `days[0]` y un "Cambiar
// Plato" reescribiría otro día en silencio.
//
// Este helper es el ÚNICO sitio que deriva un índice de escritura. Devuelve
// `null` para todo lo que no sea un día vivo. Ningún callsite lo construye a
// mano. Vive aquí y no en Dashboard.jsx para que sea testeable sin arrastrar
// un componente de ~8.900 líneas con todas sus dependencias.
export function writableDayIndex(selectedDay) {
    if (!selectedDay || selectedDay.origen !== 'vivo') return null;
    return Number.isInteger(selectedDay.idx) ? selectedDay.idx : null;
}
