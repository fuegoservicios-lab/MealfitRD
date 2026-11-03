// [P1-DIARY-ROLLOVER-4AM · 2026-11-02] Corte de día biológico a las 4:00 AM hora local.
// Entre las 00:00 y las 03:59:59 AM local, el usuario sigue en su día despierto anterior.
// A las 04:00:00 AM local el contador y el diario reinician para el nuevo día.
export const DIARY_ROLLOVER_HOUR = 4;
const ROLLOVER_MS = DIARY_ROLLOVER_HOUR * 60 * 60 * 1000;

/**
 * Retorna un objeto Date desplazado restando las horas del rollover (4h).
 * Al pedirle componentes locales (.getFullYear(), .getMonth(), .getDate())
 * sobre este Date, devuelve el año, mes y día del DÍA BIOLÓGICO activo.
 */
export const getBiologicalDate = (now = new Date()) => {
    const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
    return new Date(t - ROLLOVER_MS);
};

/**
 * Devuelve la fecha del día biológico en formato YYYY-MM-DD en hora local.
 */
export const getBiologicalDateStr = (now = new Date()) => {
    const d = getBiologicalDate(now);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
