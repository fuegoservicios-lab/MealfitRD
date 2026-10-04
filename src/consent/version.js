// [P1-PLAN-LOTE-844 · 2026-09-29] La versión del permiso para la IA de terceros (auditoría App Store, fila 4, §A.1).
//
// ESPEJO de `AI_CONSENT_VERSION` en `backend/consentimientos.py`; los ata
// `test_p1_plan_lote_843_consentimiento.py::test_la_version_del_frontend_es_la_misma` (y aquí `lote844.version`).
// El backend rechaza cualquier otra (409 al concederla, 428 al usar la IA), así que subirla vuelve a pedir el
// permiso a TODOS. Se sube cuando cambia un proveedor, los datos que recibe o su país —también si un knob cambia de
// proveedor—, y ANTES de activar el cambio. El texto que se acepta vive en `textoDeLaHoja.js`.
export const AI_CONSENT_VERSION = 'ia-2026-10-voz';

/** Con esta cabecera el INVITADO declara su permiso en cada llamada a la IA. Una cuenta con sesión NUNCA la manda: su
 *  permiso vive en el servidor, y el backend trata un token inválido o caducado como invitado, así que una cabecera
 *  sacada del dispositivo podría llevar una llamada a la IA de alguien que lo retiró en otro dispositivo. */
export const AI_CONSENT_HEADER = 'X-Bioboros-AI-Consent';

/** El permiso del INVITADO guardado en este dispositivo: `{ v, at, quien, analytics }`, con
 *  `quien` = 'invitado:<session_id>'. Las cuentas no guardan nada aquí. Lo escribe solo `consentimientoIA.js`. */
export const AI_CONSENT_STORAGE_KEY = 'mealfit_ai_consent';
