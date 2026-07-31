// [P1-PENDING-STATUS-RETRY · 2026-07-31] Preguntar al backend en qué estado quedó el
// pipeline cuando el stream ya se rompió — reintentando mientras esté inalcanzable.
//
// POR QUÉ REINTENTAR, Y NO PREGUNTAR UNA VEZ
// El guard que consulta `/pending-status` antes de rebotar al formulario existe desde
// P1-MOBILE-SSE-DROP-RECOVERY y su intención es correcta: distinguir "el backend se
// cayó" de "solo se perdió el stream". Pero preguntaba UNA vez, y un reinicio del
// backend provoca las DOS cosas a la vez — mata el SSE y deja `/pending-status`
// inalcanzable en el mismo instante. La consulta que debía rescatar al usuario la
// disparaba el mismo evento que garantizaba que fallara, así que el guard no podía
// funcionar justo en el caso donde ambas condiciones están correlacionadas.
//
// Incidente que lo destapó (31 jul, 01:55): plan generado, aprobado y PERSISTIDO
// (af58ec2e, banda clínica 1.00) un segundo antes de que systemd parara el servicio.
// El usuario vio "Sin conexión con la IA" y acabó en el formulario, con su plan ya
// guardado. Peor: esa rama además limpia `mealfit_plan_in_progress`, así que apagaba
// también a `<PendingPipelineRecovery/>`, la segunda red.
//
// POR QUÉ VIVE AQUÍ Y NO EN Plan.jsx
// Los tests de Plan.jsx son parser-based (su árbol de imports es demasiado pesado para
// montarlo), y un test parser-based NO EJECUTA NADA: no podría demostrar que
// inalcanzable devuelve `null` y no `'none'`, que es la distinción de la que depende
// todo. Si la regla que más importa no se puede ejecutar, el problema es dónde vive la
// regla. Mismo motivo por el que el gate de la Nevera salió a `utils/pantryGate.js`.
import { fetchWithAuth } from '../config/api';
import { safeLocalStorageGet } from './safeLocalStorage';

// Medido en producción: un `systemctl restart` deja el backend inalcanzable ~7s
// (31 jul, 01:55:36 → 01:55:43). Cuatro intentos cubren ~18s, suficiente para
// distinguir un reinicio de una caída real sin que el usuario espere de más.
export const PENDING_STATUS_RETRY_DELAYS_MS = [0, 3000, 6000, 9000];

/**
 * @param {number[]} [delays] Esperas entre intentos. Parametrizado para que los tests
 *   ejerciten la lógica sin relojes falsos ni esperas reales.
 * @returns {Promise<'complete'|'generating'|'none'|null>} El estado del backend, o
 *   `null` si sigue inalcanzable tras agotar los intentos.
 *
 *   `null` significa **"no sé"**, NO "no hay nada". El caller DEBE tratarlos distinto:
 *   con `'none'` puede rebotar al formulario; con `null` no sabe si hay un plan
 *   esperando. Colapsar los dos es exactamente el bug que este módulo cierra.
 */
export async function peekPendingStatusWithRetry(delays = PENDING_STATUS_RETRY_DELAYS_MS) {
    for (let i = 0; i < delays.length; i++) {
        const espera = delays[i];
        if (espera > 0) await new Promise((r) => setTimeout(r, espera));
        try {
            const sid = safeLocalStorageGet('mealfit_guest_session_id', null);
            const qs = sid ? `?session_id=${encodeURIComponent(sid)}` : '';
            const res = await fetchWithAuth(`/api/plans/pending-status${qs}`);
            if (res?.ok) {
                const body = await res.json();
                const status = body?.status ?? null;
                if (status) {
                    if (i > 0) {
                        console.warn(
                            `🔁 /pending-status respondió '${status}' al intento ${i + 1} — `
                            + 'el backend estaba volviendo, no caído.',
                        );
                    }
                    return status;
                }
            }
            // Respuesta no-ok (5xx durante el arranque) → sigue reintentando.
        } catch { /* inalcanzable → siguiente intento */ }
    }
    return null;
}

export default peekPendingStatusWithRetry;
