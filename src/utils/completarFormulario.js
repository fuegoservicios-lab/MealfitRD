// [P1-PLAN-LOTE-164 · 2026-09-22] «Completar lo que falta»: quien usa la app como CONTADOR y enciende el plan entra
// al formulario para contestar SOLO lo que la rama corta se saltó, no para rehacer los 26 pasos.
//
// Por qué una marca y no un `state` de la navegación: el formulario guarda su posición en localStorage y sobrevive a
// recargas, a matar la app y a una actualización OTA a mitad; un `location.state` se pierde en todas. La marca vive
// hasta que el formulario se envía, el usuario vuelve a su contador, cierra sesión o pasa una semana.
//
// La LISTA de pasos se fija la primera vez que el formulario la calcula (`fijarPasosCompletar`) y ya no se mueve:
// si se recalculara con cada respuesta, contestar una pregunta la sacaría de la lista y los índices se correrían
// bajo los pies del usuario.
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';

export const CLAVE_COMPLETAR = 'mealfit_wizard_completar';
const CADUCA_MS = 7 * 24 * 3600 * 1000;

/** La puerta del contador (interruptor de Configuración y tarjeta del dashboard) la pide antes de navegar. */
export function pedirCompletarFormulario(ahora = Date.now()) {
    safeLocalStorageSet(CLAVE_COMPLETAR, { v: 1, pedidoEn: ahora });
}

/** `{ pedidoEn, ids? }` o null. Una marca rota o caducada se borra y cuenta como que no hay. */
export function leerCompletarFormulario(ahora = Date.now()) {
    const crudo = safeLocalStorageGet(CLAVE_COMPLETAR, null);
    if (!crudo) return null;
    let v = null;
    try { v = JSON.parse(crudo); } catch { v = null; }
    if (!v || typeof v !== 'object' || typeof v.pedidoEn !== 'number' || ahora - v.pedidoEn > CADUCA_MS) {
        safeLocalStorageRemove(CLAVE_COMPLETAR);
        return null;
    }
    return { pedidoEn: v.pedidoEn, ids: Array.isArray(v.ids) ? v.ids.filter((x) => typeof x === 'string') : null };
}

/** Fija la lista de pasos (claves) la PRIMERA vez; si ya estaba fijada, no la toca. Devuelve la lista vigente. */
export function fijarPasosCompletar(ids) {
    const actual = leerCompletarFormulario();
    if (!actual) return null;
    if (Array.isArray(actual.ids)) return actual.ids;
    safeLocalStorageSet(CLAVE_COMPLETAR, { v: 1, pedidoEn: actual.pedidoEn, ids });
    return ids;
}

export function terminarCompletarFormulario() {
    safeLocalStorageRemove(CLAVE_COMPLETAR);
}
