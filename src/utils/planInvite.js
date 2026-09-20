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
// EL ESPEJO LOCAL (misma clave de siempre) guarda la SEMANA entera, `{ u, visibleUntil, until }`:
//   · ahora < visibleUntil          → a la vista, y se pinta EN EL ACTO (sin esperar a la red);
//   · visibleUntil ≤ ahora < until  → escondida, sin preguntar a nadie;
//   · después (o sin espejo)        → no se sabe: nace escondida y se pregunta al servidor.
// La primera versión solo recordaba el «escondida»: la tarjeta nacía escondida en CADA entrada al contador y reaparecía
// un segundo después, cuando contestaba la red, empujando todo hacia abajo. El dueño: «desaparece 1 segundo y vuelve a
// aparecer cuando salgo del apartado y vuelvo, no quiero que pase eso». El espejo de OTRO usuario (`u`) no cuenta.
import { fetchWithAuth } from '../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';

export const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
export const A_LA_VISTA_MS = 24 * 60 * 60 * 1000;
const RUTA = '/api/user/preferences/plan-invite';

function _espejo(clave, userId) {
    try {
        const raw = safeLocalStorageGet(clave, null);
        if (!raw || raw === '1') return null;
        const doc = JSON.parse(raw);
        return doc && doc.u === String(userId || '') ? doc : null;
    } catch {
        return null;
    }
}

function _guardar(clave, userId, visibleUntil, until) {
    safeLocalStorageSet(clave, JSON.stringify({ u: String(userId || ''), visibleUntil, until }));
}

/** Lo que el espejo local sabe SIN red: 'visible' | 'escondida' | 'desconocido'. Síncrona: decide cómo NACE la tarjeta. */
export function estadoLocal(clave, userId, ahora = Date.now()) {
    const doc = _espejo(clave, userId);
    if (!doc) return 'desconocido';
    if (Number(doc.visibleUntil) > ahora) return 'visible';
    return Number(doc.until) > ahora ? 'escondida' : 'desconocido';
}

/** Hasta cuándo (ms) está escondida para `userId` según el espejo; 0 = no lo está o no se sabe (incluye el «1» heredado). */
export function escondidaHasta(clave, userId, ahora = Date.now()) {
    return estadoLocal(clave, userId, ahora) === 'escondida' ? Number(_espejo(clave, userId).until) : 0;
}

/**
 * ¿Toca mostrarla AHORA? `{ visible, nueva }` (`nueva` = esta vista ABRE la semana: hay que anotarla).
 * Manda el servidor; el espejo evita preguntarle lo que ya se sabe. Sin respuesta del servidor se conserva lo que diga
 * el espejo, y si no sabe nada se muestra — salvo a quien YA la había descartado con el «1» heredado.
 */
export async function leerInvitacion(clave, userId, ahora = Date.now()) {
    const local = estadoLocal(clave, userId, ahora);
    if (local === 'escondida') return { visible: false, nueva: false };
    const abrir = () => {
        if (local !== 'visible') _guardar(clave, userId, ahora + A_LA_VISTA_MS, ahora + SEMANA_MS);
        return { visible: true, nueva: local !== 'visible' };
    };
    const sinServidor = () => {
        if (local === 'visible') return { visible: true, nueva: false };
        return safeLocalStorageGet(clave, null) === '1' ? { visible: false, nueva: false } : abrir();
    };
    try {
        const res = await fetchWithAuth(RUTA);
        if (!res.ok) return sinServidor();
        const datos = await res.json();
        if (datos?.visible === false) {
            const vuelve = Date.parse(datos.next_at || '');
            _guardar(clave, userId, 0, Number.isFinite(vuelve) && vuelve > ahora ? vuelve : ahora + A_LA_VISTA_MS);
            return { visible: false, nueva: false };
        }
        return abrir();
    } catch {
        return sinServidor();
    }
}

/** 'seen' (la tarjeta abrió su semana) o 'dismiss' («Ahora no»). El descarte vale en el acto, con o sin red. */
export function anotarInvitacion(clave, userId, accion, ahora = Date.now()) {
    if (accion === 'dismiss') _guardar(clave, userId, 0, ahora + SEMANA_MS);
    return fetchWithAuth(RUTA, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: accion }),
    }).catch(() => null);
}
