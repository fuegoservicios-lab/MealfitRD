// [P3-NOTIF-CENTER · 2026-06-16] Store liviano de notificaciones: cuando el
// usuario descarta un aviso (micronutrientes, plan no óptimo, etc.) con su "X",
// en vez de perderse se GUARDA aquí y queda accesible desde el centro de
// notificaciones (NotificationCenter), donde puede borrarse definitivamente.
//
// Backing: localStorage (`mealfit_notifications`) + un CustomEvent para que el
// centro reaccione al instante; `storage` cubre sincronización cross-tab.

import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';
import { safeJSONParse } from './safeJSONParse';

// [P2-NOTIF-KEY-COLLISION · 2026-06-19] (audit fresco P2-11) La clave anterior 'mealfit_notifications' COLISIONA
// con el toggle booleano de preferencia de Settings.jsx (que la reclamó primero, legacy P1-FRONTEND-LEGACY-
// LOCALSTORAGE) → pérdida de datos BIDIRECCIONAL: Settings escribe "true"/"false" → el store se lee como []
// (no-array) y se vacía; el store escribe un array JSON → Settings lo lee como ≠'true' y apaga el toggle solo.
// El store del NotificationCenter se mueve a su propia clave; Settings conserva 'mealfit_notifications' para su
// booleano. Backfill one-shot de los avisos archivados que vivían en la clave vieja (si era un array).
const KEY = 'mealfit_notification_center';
const LEGACY_KEY = 'mealfit_notifications';
export const NOTIFICATIONS_EVENT = 'mealfit-notifications-change';
// [P1-COHERENCE-BANNER-NOTIF · 2026-06-16] Evento para pedirle al
// NotificationCenter que ABRA su drawer (p.ej. tras archivar un aviso desde un
// banner del dashboard → "redirigir a notificaciones").
export const NOTIFICATIONS_OPEN_EVENT = 'mealfit-notifications-open';
const MAX = 40;

/** Pide al NotificationCenter que se abra. Lo escucha y abre su drawer; no-op en
 *  SSR / sin window. Úsalo tras `addNotification` cuando quieras "llevar" al
 *  usuario al centro (no solo archivar en silencio). */
export function openNotificationCenter() {
    try {
        window.dispatchEvent(new Event(NOTIFICATIONS_OPEN_EVENT));
    } catch {
        /* SSR / sin window: el usuario abre el centro manualmente con la campana */
    }
}

// [P2-NOTIF-KEY-COLLISION · 2026-06-19] Migración one-shot de los avisos archivados desde la clave vieja
// (solo si era un array). NO se borra la clave vieja: ahora pertenece al toggle booleano de Settings.
let _backfilledLegacy = false;
function _backfillLegacy() {
    if (_backfilledLegacy) return;
    _backfilledLegacy = true;
    try {
        if (safeLocalStorageGet(KEY, null) != null) return; // ya hay store nuevo → no migrar
        const legacy = safeJSONParse(safeLocalStorageGet(LEGACY_KEY, null), null);
        if (Array.isArray(legacy) && legacy.length) {
            safeLocalStorageSet(KEY, JSON.stringify(legacy.slice(0, MAX)));
        }
    } catch { /* best-effort: la colisión ya hacía el dato poco fiable */ }
}

function _read() {
    _backfillLegacy();
    const arr = safeJSONParse(safeLocalStorageGet(KEY, null), []);
    // slice defensivo: aunque otro tab haya escrito >MAX (race cross-tab), aquí
    // siempre cargamos como mucho MAX.
    return Array.isArray(arr) ? arr.slice(0, MAX) : [];
}

function _write(arr) {
    // Sólo notificar si la persistencia tuvo éxito: en cuota agotada (iOS
    // Private Mode) safeLocalStorageSet devuelve false y los listeners re-leerían
    // datos stale — mejor no emitir un "cambio" que no se guardó. Devuelve si
    // persistió para que los callers decidan (p.ej. no marcar un backfill como
    // hecho si la escritura falló).
    const ok = safeLocalStorageSet(KEY, JSON.stringify(arr.slice(0, MAX)));
    if (!ok) return false;
    try {
        window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
    } catch {
        /* SSR / sin window: el lector on-mount lo recoge igual */
    }
    return true;
}

/** Lista actual (más reciente primero). */
export function getNotifications() {
    return _read();
}

/** Añade (o refresca) una notificación. `id` estable (p.ej. `micros_<planSig>`)
 *  evita duplicados al re-descartar el mismo aviso del mismo plan. `data` es un
 *  payload estructurado opcional (gaps/supplements/motivo…) que la vista
 *  expandida usa para mostrar la información completa. Re-añadir marca `read:
 *  false` (el aviso "vuelve a ser nuevo"). */
export function addNotification({ id, kind = 'info', title, message, severity = 'info', ts, data = null }) {
    if (!title && !message) return null;
    const nid = id || `${kind}_${(typeof Date !== 'undefined' ? Date.now() : 0)}`;
    // Dedup por id Y por contenido (kind+title+message): evita que un id legacy
    // por timestamp conviva con el nuevo id estable mostrando lo mismo dos veces.
    const dupKey = `${kind}|${title || ''}|${message || ''}`;
    const rest = _read().filter(
        (n) => n.id !== nid && `${n.kind}|${n.title}|${n.message}` !== dupKey,
    );
    rest.unshift({
        id: nid,
        kind,
        title: title || '',
        message: message || '',
        severity,
        ts: ts || (typeof Date !== 'undefined' ? Date.now() : 0),
        data: data || null,
        read: false,
    });
    return _write(rest) ? nid : null;
}

/** Enriquece una notificación EXISTENTE con su payload `data` sin tocar su
 *  posición ni su estado de lectura. Úsalo para "upgradear" notificaciones
 *  legacy (creadas antes de que existiera la vista expandida) sin marcarlas
 *  como no leídas otra vez. No-op si no existe o si ya tiene data. */
export function setNotificationData(id, data) {
    if (!data) return false;
    const arr = _read();
    let changed = false;
    const next = arr.map((n) => {
        if (n.id === id && !n.data) {
            changed = true;
            return { ...n, data };
        }
        return n;
    });
    // Sin cambios (ya tiene data o no existe) = nada que hacer → "hecho".
    if (!changed) return true;
    return _write(next);
}

/** Marca una notificación como leída. */
export function markNotificationRead(id) {
    const arr = _read();
    let changed = false;
    const next = arr.map((n) => {
        if (n.id === id && !n.read) {
            changed = true;
            return { ...n, read: true };
        }
        return n;
    });
    if (changed) _write(next);
}

/** Marca todas como leídas. */
export function markAllNotificationsRead() {
    const arr = _read();
    if (!arr.some((n) => !n.read)) return;
    _write(arr.map((n) => (n.read ? n : { ...n, read: true })));
}

/** Cantidad de no leídas. */
export function getUnreadCount() {
    return _read().filter((n) => !n.read).length;
}

/** Borra una notificación por id. */
export function removeNotification(id) {
    _write(_read().filter((n) => n.id !== id));
}

/** Vacía el centro. */
export function clearNotifications() {
    _write([]);
}

/** Colapsa notificaciones idénticas (mismo kind+title+message), dejando la más
 *  reciente. Limpia duplicados legacy creados antes del id estable (cuando un id
 *  undefined caía en un fallback por timestamp → una notificación nueva por cada
 *  descarte). No-op si no hay duplicados. */
export function dedupeNotifications() {
    const arr = _read(); // más reciente primero
    const seen = new Set();
    const out = [];
    for (const n of arr) {
        const key = `${n.kind}|${n.title}|${n.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(n);
    }
    if (out.length !== arr.length) _write(out);
}
