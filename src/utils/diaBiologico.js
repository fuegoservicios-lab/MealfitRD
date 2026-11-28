// [P1-DIARY-ROLLOVER-4AM · 2026-11-02] Corte de día biológico a las 4:00 AM hora local.
// Entre las 00:00 y las 03:59:59 AM local, el usuario sigue en su día despierto anterior.
// A las 04:00:00 AM local el contador y el diario reinician para el nuevo día.
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';

export const DIARY_ROLLOVER_HOUR = 4;
const ROLLOVER_MS = DIARY_ROLLOVER_HOUR * 60 * 60 * 1000;

/**
 * Retorna un objeto Date desplazado restando las horas del rollover (4h).
 * Al pedirle componentes locales (.getFullYear(), .getMonth(), .getDate())
 * sobre este Date, devuelve el año, mes y día del DÍA BIOLÓGICO activo.
 */
// [P1-PLAN-LOTE-1145 · 2026-11-21] «Tu día termina cuando duermes»: el servidor (`GET /api/diary/dia-activo`, regla en
// `backend/dia_extendido.py`) dice si el usuario SIGUE en el día anterior pasadas las 4:00 (no ha dormido, lo pidió, o
// su día termina más tarde). Entonces todo instante entre el corte natural (`desdeMs`) y `hastaMs` es de ese día:
// el contador no vuelve a 0 a las 4:00 de una noche en vela. Lo que se registra en ese rato el servidor lo guarda al
// final de ese día, así que las horas guardadas nunca caen en la ventana: solo «ahora» la cruza.
const _CLAVE_EXT = 'mealfit_dia_extendido';
let _ext = null;
let _estado = null;
const _oyentes = new Set();
try {
    const raw = safeLocalStorageGet(_CLAVE_EXT, null);
    const v = raw ? JSON.parse(raw) : null;
    if (v && Number.isFinite(v.desdeMs) && Number.isFinite(v.hastaMs) && Date.now() < v.hastaMs) _ext = v;
} catch { _ext = null; }

/** El día extendido vigente `{ dia, desdeMs, hastaMs, motivo }`, o null. */
export const diaExtendido = (ahora = Date.now()) => (_ext && ahora < _ext.hastaMs ? _ext : null);
/** Lo último que dijo el servidor (incluye `puede_seguir` y `anterior`), o null. */
export const estadoDelDiaActivo = () => _estado;
export const suscribirDiaActivo = (fn) => { _oyentes.add(fn); return () => _oyentes.delete(fn); };

/** Clave estable del aviso activo actual para detectar novedades en la campana. */
export const claveAvisoDiaActivo = (estado, descartado = '') => {
    if (!estado) return '';
    if (estado.extendido) return `ext:${estado.dia || ''}:${estado.motivo || ''}`;
    if (estado.puede_seguir && estado.anterior && descartado !== estado.anterior) return `seg:${estado.anterior}`;
    return '';
};

/** Aplica la respuesta de `/api/diary/dia-activo`. Devuelve true si cambió el día extendido. */
export const fijarDiaActivo = (estado) => {
    const antes = _ext ? `${_ext.dia}|${_ext.hastaMs}` : '';
    _estado = estado && typeof estado === 'object' ? estado : null;
    const desdeMs = Date.parse(_estado?.fin || '');
    const hastaMs = Date.parse(_estado?.hasta || '');
    _ext = _estado?.extendido && _estado?.dia && Number.isFinite(desdeMs) && Number.isFinite(hastaMs)
        ? { dia: _estado.dia, desdeMs, hastaMs, motivo: _estado.motivo || null }
        : null;
    if (_ext) safeLocalStorageSet(_CLAVE_EXT, JSON.stringify(_ext));
    else safeLocalStorageRemove(_CLAVE_EXT);
    const cambio = antes !== (_ext ? `${_ext.dia}|${_ext.hastaMs}` : '');
    _oyentes.forEach((fn) => { try { fn(_estado); } catch { /* un oyente roto no frena a los demás */ } });
    return cambio;
};

export const getBiologicalDate = (now = new Date()) => {
    const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
    if (_ext && t >= _ext.desdeMs && t < _ext.hastaMs) return new Date(_ext.desdeMs - 1 - ROLLOVER_MS);
    return new Date(t - ROLLOVER_MS);
};

const _aISO = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/**
 * Devuelve la fecha del día biológico en formato YYYY-MM-DD en hora local.
 */
export const getBiologicalDateStr = (now = new Date()) => _aISO(getBiologicalDate(now));

/**
 * Devuelve la fecha de calendario local en formato YYYY-MM-DD (sin desplazar por rollover).
 */
export const getCalendarDateStr = (now = new Date()) => {
    const d = now instanceof Date ? now : new Date(now);
    return _aISO(d);
};

/**
 * Comprueba si dos fechas corresponden al mismo día biológico.
 */
export const isSameBiologicalDay = (a, b) => {
    if (!a || !b) return false;
    const da = a instanceof Date ? a : new Date(a);
    const db = b instanceof Date ? b : new Date(b);
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
    return getBiologicalDateStr(da) === getBiologicalDateStr(db);
};

/**
 * Comprueba si `a` corresponde al día biológico inmediatamente anterior al día de referencia.
 */
export const isPreviousBiologicalDay = (a, reference = new Date()) => {
    if (!a) return false;
    const refBio = getBiologicalDate(reference);
    const prevBio = new Date(refBio.getFullYear(), refBio.getMonth(), refBio.getDate() - 1, 12, 0, 0);
    return isSameBiologicalDay(a, prevBio);
};
