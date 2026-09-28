// [P1-PLAN-LOTE-715 · 2026-09-28] Cómo se lleva el perfil del SERVIDOR con las copias del cliente.
//
// Vive fuera de `AssessmentContext.jsx` (que tiene tope de líneas) y es la mitad cliente de `backend/perfil_servidor.py`.
//
// 1. Claves con DUEÑO en el servidor. Las escribe su propio panel de Configuración (`PUT /api/user/preferences/
//    {clinical-profile,super-personalization,staple-foods}`, FOR UPDATE). La regla general de la hidratación («solo se
//    rellena lo vacío») las congelaba en la PRIMERA carga: el TFG 45 puesto en el teléfono no llegaba nunca al
//    formulario del ordenador, que lo devolvía viejo en la siguiente renovación (y el plan salía sin el tope renal).
//    Para ellas el servidor gana siempre que el usuario no las esté editando en este dispositivo (`editedFieldsRef`,
//    que el contexto comprueba antes).
//
// 2. La copia en memoria del perfil se FUNDE igual que en el servidor (`COALESCE(health_profile,'{}') || parche`).
//    Antes se REEMPLAZABA con el parche: un guardado parcial (edad y sexo) dejaba el perfil en memoria sin el resto de
//    claves, y los interruptores de recordatorios —«falta = encendido»— se prendían solos hasta recargar. Las claves que
//    el servidor ignoró (`ignored_keys`: dueño en el servidor) no se funden: en memoria mandaría un valor que no existe.
//
// 3. Restos por usuario que sobrevivían al cierre de sesión (P1-PLAN-LOTE-716).
import { borrarTextosTraducidos } from '../hooks/useTextosTraducidos';
import { persistAvatar } from './avatarStore';
import { safeLocalStorageRemove } from './safeLocalStorage';

export const CLAVES_DEL_PANEL = Object.freeze(['clinical_profile', 'super_personalization', 'staple_foods']);

/** ¿Se adopta el valor del servidor `v` sobre la copia local `cur` de la clave `k`? `null` = la clave no es de un
 *  panel y decide la regla general. */
export function hidrataClaveDelPanel(k, cur, v) {
    if (!CLAVES_DEL_PANEL.includes(k)) return null;
    if (v === null || v === undefined) return false;
    try { return JSON.stringify(cur) !== JSON.stringify(v); } catch { return false; }
}

/** El perfil en memoria tras un PATCH que el servidor aceptó: `campos` de primer nivel + `health_profile` FUNDIDO. */
export function fusionarPerfilEnMemoria(prev, campos, parcheHp, ignoradas) {
    const base = { ...(prev || {}), ...(campos || {}) };
    if (!parcheHp || typeof parcheHp !== 'object') return base;
    const fuera = new Set(Array.isArray(ignoradas) ? ignoradas : []);
    const aplicado = Object.fromEntries(Object.entries(parcheHp).filter(([k]) => !fuera.has(k)));
    return { ...base, health_profile: { ...(prev?.health_profile || {}), ...aplicado } };
}

/** Traducciones de lo que el coach recuerda (alergias y condiciones en claro), la preferencia de registro y el avatar:
 *  el siguiente usuario del dispositivo los heredaba. */
export function limpiarRestosPorUsuario() {
    try { borrarTextosTraducidos(); } catch { /* noop */ }
    safeLocalStorageRemove('mealfit_logging_preference');
    try { persistAvatar(null); } catch { /* noop */ }   // avisa también al avatar del sidebar
}
