// [P1-PLAN-LOTE-148 · 2026-09-21] «Continuar con Apple» en el NAVEGADOR. El dueño: «en la web también debería
// verse el poder continuar con apple».
//
// No va por Neon Auth —no ofrece Apple como proveedor— sino por la librería del propio Apple, en modo emergente.
// Verificado en su documentación antes de escribir nada: con `usePopup`, `AppleID.auth.signIn()` devuelve el
// `id_token` directamente en JavaScript. Ese token lo verifica el MISMO endpoint que ya usa el iPhone
// (`/api/auth/apple/native`), que acepta como destinatario tanto el binario como el Services ID de la web.
//
// Por eso no hace falta la clave `.p8`: esa clave sirve para canjear el CÓDIGO por tokens, y aquí el código se
// ignora. Lo único que necesitamos es una identidad firmada por Apple, y eso es el `id_token`.
//
// La librería se carga BAJO DEMANDA, al pulsar: son ~40 KB de Apple que no tiene por qué pagar quien entra con su
// correo (la dieta del landing, `landing_apex_antipatterns.md`).
import { nuevoNonce } from './appleSignInNative';

// Services ID `com.bioboros.app.web`, registrado en Apple con el dominio y la URL de vuelta de la app.
export const APPLE_WEB_CLIENT_ID = 'com.bioboros.app.web';
const APPLE_JS = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

let cargando = null;

function cargarAppleJS() {
    if (window.AppleID?.auth) return Promise.resolve();
    if (cargando) return cargando;
    cargando = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = APPLE_JS;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { cargando = null; reject(new Error('APPLE_JS_NO_CARGA')); };
        document.head.appendChild(s);
    });
    return cargando;
}

/**
 * Abre la ventana de Apple. Devuelve `{ identityToken, nonce, name }` —lo mismo que el camino nativo, para que el
 * canje sea el mismo— o `{ cancelado: true }` si la persona cerró la ventana.
 */
export async function pedirCredencialDeAppleWeb() {
    await cargarAppleJS();
    const nonce = nuevoNonce();
    window.AppleID.auth.init({
        clientId: APPLE_WEB_CLIENT_ID,
        scope: 'name email',
        // Registrada en el Services ID. En modo emergente Apple la usa para el salto interno y devuelve el
        // resultado por JavaScript: esta página nunca llega a recargarse.
        redirectURI: `${window.location.origin}/login`,
        nonce,
        usePopup: true,
    });
    let r;
    try {
        r = await window.AppleID.auth.signIn();
    } catch (e) {
        // Es el ÚNICO error que Apple documenta para esta vía.
        if (e?.error === 'user_cancelled_authorize' || e?.error === 'popup_closed_by_user') return { cancelado: true };
        throw e;
    }
    const identityToken = r?.authorization?.id_token;
    if (!identityToken) throw new Error('SIN_TOKEN');
    // Apple solo manda el nombre la PRIMERA vez que la persona autoriza; después viene vacío.
    const partes = [r?.user?.name?.firstName, r?.user?.name?.lastName].filter(Boolean);
    return { identityToken, nonce, name: partes.join(' ') };
}
