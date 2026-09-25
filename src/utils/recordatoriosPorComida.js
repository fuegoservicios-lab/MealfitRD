// [P1-PLAN-LOTE-223 · 2026-09-24] Lo puro de «Configuración → Recordatorios de comida»: qué se guarda y cómo se lee una
// hora. Fuera del componente para que se pruebe sin DOM (y para que ese fichero solo exporte el componente).

/** La clave de `health_profile` (el servidor la valida en `PATCH /api/profile`). */
export const CLAVE_AVISOS_POR_COMIDA = 'avisos_por_comida';

export const aHHMM = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** Lo que se guarda: las cuatro comidas. La hora solo viaja si la persona la eligió; si no, `null` y sigue la normal. */
export function configParaGuardar(comidas) {
    const out = {};
    for (const c of comidas || []) {
        if (!c?.meal) continue;
        out[c.meal] = { activo: c.active !== false, hora: c.chosen ? aHHMM(c.hour, c.minute) : null };
    }
    return out;
}

/** `"12:30"` → `{ hora: 12, minuto: 30 }`, o `null` si el campo quedó vacío o a medias. */
export function leerHHMM(valor) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(valor || ''));
    if (!m) return null;
    const hora = Number(m[1]);
    const minuto = Number(m[2]);
    return hora <= 23 && minuto <= 59 ? { hora, minuto } : null;
}
