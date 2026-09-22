// [P1-PLAN-LOTE-160 · 2026-09-22] «Continuar con Google» en la app de Android.
//
// Por qué NO se reutiliza el camino de iOS (lote 147): ahí el flujo es código de autorización + PKCE, que
// vuelve a la app por un esquema propio. Google retiró ese destino en Android — «Custom URI schemes are no
// longer supported on Android» —, así que no hay vuelta y no hay código. El camino vigente es Credential
// Manager, que entrega el `id_token` YA emitido. Es una diferencia de PROTOCOLO, no de plataforma: por eso
// son dos ficheros y no un `if (android)` dentro de uno.
//
// Lo que sí es idéntico es la desconfianza: el token no se mira aquí. Se manda tal cual al backend, que
// comprueba firma, emisor, audiencia, nonce y frescura contra el JWKS de Google. El cliente no decide quién
// eres — ni aquí ni en iOS.
import { registrarPluginNativo } from '../config/platform';

// A nivel de MÓDULO y jamás devuelto desde una función `async`: es un Proxy, y si sale de una promesa el
// motor le lee `.then` y se cuelga para siempre (la trampa del lote 133).
const MfGoogleId = registrarPluginNativo('MfGoogleId');

// El cliente de tipo **Web** del proyecto `mealfitt`. Sí, Web, en Android: lo exige Google como
// `serverClientId` y es el que acaba en el `aud` del token. El cliente de tipo Android existe aparte y es
// lo que ata la app a su paquete y a la huella SHA-1 de su clave de firma, pero nunca viaja en el token.
// Público, igual que el de iOS. El SECRETO de ese cliente no pinta nada aquí: no hay canje.
export const GOOGLE_SERVER_CLIENT_ID = '323329713741-qqcajd7sslluuegc1hq0pcdcrik0mvkb.apps.googleusercontent.com';

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function aleatorio(n = 32) {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
}

/**
 * Abre la hoja de cuentas de Google del sistema. Devuelve `{ idToken, nonce }` para que el backend lo
 * verifique, o `{ cancelado: true }` si la persona la cerró (no es un error).
 *
 * El `nonce` se sortea AQUÍ y viaja por dos caminos que solo se juntan en el backend: dentro del token que
 * firma Google, y en el cuerpo de nuestra petición. Que coincidan es lo que prueba que este token se emitió
 * para esta pulsación y no se reinyectó desde otra.
 */
export async function pedirTokenDeGoogle() {
    const nonce = aleatorio(32);
    let respuesta;
    try {
        respuesta = await MfGoogleId.start({ serverClientId: GOOGLE_SERVER_CLIENT_ID, nonce });
    } catch (e) {
        if (e?.code === 'CANCELADO') return { cancelado: true };
        // Sin cuentas en el teléfono no hay nada que reintentar; se distingue para poder decirlo con
        // palabras en la pantalla en vez de un «inténtalo de nuevo» que no llevaría a ninguna parte.
        if (e?.code === 'SIN_CUENTAS') return { sinCuentas: true };
        throw e;
    }
    const idToken = respuesta?.idToken;
    if (!idToken) throw new Error('SIN_TOKEN');
    return { idToken, nonce };
}
