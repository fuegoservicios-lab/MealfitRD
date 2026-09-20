// [P1-PLAN-LOTE-135 · 2026-09-20] La invitación «¿Quieres que la IA te arme el plan?»: una vez por SEMANA y por USUARIO.
//
// El dueño, con la captura del contador: «quiero que aparezca una sola vez por usuario y que cuando le den a "Ahora no"
// no aparezca más, ya que eso puedes encenderlo en Configuración… lo que sí puedes hacer es que aparezca 1 vez a la
// semana, para así motivar al usuario a encenderlo».
//
// Por qué la veía «tan seguido»: el descarte vivía SOLO en el localStorage del dispositivo. Cada binario nuevo de
// TestFlight, cada navegador y la PWA traen un almacén distinto, así que «Ahora no» valía para ESE almacén. Ahora la
// cuenta la lleva el servidor (`GET/PATCH /api/user/preferences/plan-invite`, backend/plan_invite.py): vista → 24 h a la
// vista → escondida hasta los 7 días; «Ahora no» → escondida en el acto, 7 días.
//
// El localStorage queda de ESPEJO (misma clave de siempre), para no preguntar al servidor lo que ya se sabe y para que
// «Ahora no» valga aunque la red falle. Guarda `{ u, until }`: el espejo de OTRO usuario del mismo dispositivo no cuenta.
import { fetchWithAuth } from '../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';

export const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
const RUTA = '/api/user/preferences/plan-invite';

/** Hasta cuándo (ms) está escondida para `userId` según el espejo local; 0 = no se sabe (incluye el «1» heredado). */
export function escondidaHasta(clave, userId) {
    try {
        const raw = safeLocalStorageGet(clave, null);
        if (!raw || raw === '1') return 0;
        const doc = JSON.parse(raw);
        if (!doc || doc.u !== String(userId || '')) return 0;
        const until = Number(doc.until);
        return Number.isFinite(until) ? until : 0;
    } catch {
        return 0;
    }
}

function _esconderHasta(clave, userId, until) {
    safeLocalStorageSet(clave, JSON.stringify({ u: String(userId || ''), until }));
}

/** ¿Toca mostrarla AHORA? `{ visible }`. Sin red se muestra: esconderla por un fallo la quitaría para siempre. */
export async function leerInvitacion(clave, userId, ahora = Date.now()) {
    if (escondidaHasta(clave, userId) > ahora) return { visible: false };
    try {
        const res = await fetchWithAuth(RUTA);
        if (!res.ok) return { visible: true };
        const datos = await res.json();
        if (datos?.visible === false) {
            const vuelve = Date.parse(datos.next_at || '');
            if (Number.isFinite(vuelve) && vuelve > ahora) _esconderHasta(clave, userId, vuelve);
            return { visible: false };
        }
        return { visible: true };
    } catch {
        return { visible: true };
    }
}

/** 'seen' (la tarjeta se pintó) o 'dismiss' («Ahora no»). El descarte vale en el acto, con o sin red. */
export function anotarInvitacion(clave, userId, accion, ahora = Date.now()) {
    if (accion === 'dismiss') _esconderHasta(clave, userId, ahora + SEMANA_MS);
    return fetchWithAuth(RUTA, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: accion }),
    }).catch(() => null);
}
