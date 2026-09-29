// [P1-PLAN-LOTE-835 · 2026-09-29] Cuenta de prueba, del lado de la PERSONA: los textos y las dos llamadas.
//
// POR QUÉ. El equipo puede marcar una cuenta como «de prueba» y, con ello, ver su contenido (formulario, comidas,
// planes, conversaciones: spec 2026-09-29, §4.4). Esa marca solo es legítima si la persona se entera DENTRO de la app
// —el aviso que sustituye al correo (§6, «Publicación»)— y puede salir cuando quiera (§7: `salir` funciona SIEMPRE, con
// el interruptor del servidor apagado también). Dos superficies lo enseñan y comparten todo lo de aquí:
//   · `AvisoCuentaPrueba` (DashboardLayout): la hoja de una sola vez, con «Entendido» y «Salir del modo de prueba»;
//   · `BloqueCuentaPrueba` (Configuración → Privacidad): el bloque fijo, con «Salir…» y confirmación.
//
// Contrato (routers/user_data.py, sin cuota: cuestan cero de IA y al llegar al tope la persona debe poder salir):
//   POST /api/profile/prueba/aviso-visto → { ok: true }              (idempotente: solo anota la primera vez)
//   POST /api/profile/prueba/salir       → { ok: true, salio: bool }
//   El perfil (GET /api/profile) trae `cuenta_de_prueba`: null | { desde, aviso_visto }.
//
// Las dos llamadas devuelven un veredicto y NUNCA lanzan: quien las usa decide qué decirle a la persona. Un aviso que
// el servidor no anotó no cuenta como visto (el contenido sigue cerrado para el equipo hasta que la anote).
import { fetchWithAuth } from '../config/api';
import { BRAND } from '../data/routeMeta';

export const RUTA_AVISO_VISTO = '/api/profile/prueba/aviso-visto';
export const RUTA_SALIR = '/api/profile/prueba/salir';

/** Los textos de las dos superficies, ya traducidos con `t` (la clave ES el español; la marca entra como `{app}`).
 *  Una función y no una constante: un `t()` en ámbito de módulo se congelaría en español al importar. */
export function textosCuentaDePrueba(t) {
    return {
        titulo: t('Esta es una cuenta de prueba'),
        explicacion: t('El equipo de {app} puede ver lo que haces en la app —tu formulario, tus comidas, tus planes y tus conversaciones con el coach, también las anteriores— para probarla y mejorarla. Puedes salir cuando quieras en Configuración → Privacidad', { app: BRAND }),
        entendido: t('Entendido'),
        salir: t('Salir del modo de prueba'),
        saliendo: t('Saliendo…'),
        guardando: t('Guardando…'),
        cancelar: t('Cancelar'),
        bloque: t('Cuenta de prueba'),
        salio: t('Ya no es una cuenta de prueba: el equipo ya no ve tu actividad'),
        confirmar: t('¿Salir del modo de prueba?'),
        confirmarDetalle: t('El equipo de {app} dejará de ver tu formulario, tus comidas, tus planes y tus conversaciones con el coach.', { app: BRAND }),
        errorSalir: t('No pudimos sacar tu cuenta del modo de prueba. Revisa tu conexión e inténtalo de nuevo.'),
        errorGuardar: t('No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.'),
    };
}

async function _enviar(ruta) {
    try {
        // Cuerpo `{}` como el resto de los POST sin datos (`/api/consents/withdraw`): vale igual con un endpoint sin
        // cuerpo que con uno cuyo modelo lo declare opcional.
        const res = await fetchWithAuth(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!res || !res.ok) return { ok: false, cuerpo: null };
        let cuerpo = null;
        try { cuerpo = await res.json(); } catch { /* un 200 sin JSON sigue siendo un 200 */ }
        return { ok: true, cuerpo };
    } catch {
        return { ok: false, cuerpo: null };
    }
}

/** Vuelve a pedir el perfil (`refreshProfileAndPlan` del contexto) para que `cuenta_de_prueba` refleje lo que acaba de
 *  pasar. Sin ruido: si falla o no hay función, el siguiente foco de la app trae el perfil igual. */
export function refrescarPerfil(refresco) {
    try {
        if (typeof refresco === 'function') Promise.resolve(refresco()).catch(() => {});
    } catch { /* el siguiente foco de la app lo trae */ }
}

/** «Entendido»: anota que la persona vio el aviso. `true` solo si el servidor lo anotó. */
export async function anotarAvisoVisto() {
    return (await _enviar(RUTA_AVISO_VISTO)).ok;
}

/** «Salir del modo de prueba». `ok` = el servidor contestó bien; `salio` = había una marca viva y se quitó (con `false`
 *  la cuenta ya no era de prueba —el equipo la había quitado antes—: para la persona, el resultado es el mismo). */
export async function salirDelModoDePrueba() {
    const { ok, cuerpo } = await _enviar(RUTA_SALIR);
    if (!ok) return { ok: false, salio: false };
    return { ok: true, salio: !(cuerpo && cuerpo.salio === false) };
}
