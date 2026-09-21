// [P1-PLAN-LOTE-147 · 2026-09-21] «Continuar con Google» en la app de iOS, sin SDK de Google.
//
// El OAuth por redirección no vuelve a la app (`P1-IOS-OAUTH-GATE`): Neon Auth manda a Safari y
// `capacitor://localhost` no es una dirección a la que Safari sepa volver. El binario trae ahora un plugin TONTO
// (`MfWebAuth`) sobre `ASWebAuthenticationSession`, que abre una página y devuelve la URL de vuelta. Toda la lógica
// del protocolo vive AQUÍ, en la web, para poder arreglarla por OTA sin pedirle otro build al dueño.
//
// El flujo es el estándar de apps instaladas (RFC 8252): código de autorización + PKCE, sin secreto.
//   1. se sortean `verifier` (aleatorio) y `nonce`; el `challenge` es SHA-256(verifier) en base64url;
//   2. Google devuelve un CÓDIGO por el esquema propio del cliente iOS;
//   3. el canje lo hace NUESTRO backend, que además verifica la firma del id_token (`/api/auth/google/native`).
// El `verifier` nunca sale de este dispositivo hasta el paso 3, y es lo que prueba que quien canjea es quien pidió.
import { registrarPluginNativo } from '../config/platform';

// A nivel de MÓDULO y jamás devuelto desde una función `async`: es un Proxy, y si sale de una promesa el motor le
// lee `.then` y se cuelga para siempre (la trampa del lote 133).
const MfWebAuth = registrarPluginNativo('MfWebAuth');

// Cliente de tipo iOS del proyecto `mealfitt`. Es público: viaja dentro del binario y en la URL de autorización.
export const GOOGLE_IOS_CLIENT_ID = '323329713741-7o63vat4382kpdg00vun714ag6i2em23.apps.googleusercontent.com';
// El esquema de vuelta de un cliente iOS es su ID al REVÉS. Lo define Google, no nosotros.
export const GOOGLE_IOS_SCHEME = `com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}`;
export const GOOGLE_IOS_REDIRECT = `${GOOGLE_IOS_SCHEME}:/oauth2redirect`;

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function aleatorio(n = 32) {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
}

async function reto(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64url(new Uint8Array(digest));
}

/**
 * Abre la pantalla de Google. Devuelve `{ code, codeVerifier, nonce, redirectUri }` para que el backend lo canjee,
 * o `{ cancelado: true }` si la persona cerró la vista (no es un error).
 */
export async function pedirCodigoDeGoogle() {
    const codeVerifier = aleatorio(32);
    const nonce = aleatorio(32);
    const state = aleatorio(16);
    const url = `${AUTORIZAR}?${new URLSearchParams({
        client_id: GOOGLE_IOS_CLIENT_ID,
        redirect_uri: GOOGLE_IOS_REDIRECT,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: await reto(codeVerifier),
        code_challenge_method: 'S256',
        nonce,
        state,
        prompt: 'select_account',
    })}`;

    let vuelta;
    try {
        const r = await MfWebAuth.start({ url, scheme: GOOGLE_IOS_SCHEME });
        vuelta = r?.callbackUrl;
    } catch (e) {
        if (e?.code === 'CANCELADO') return { cancelado: true };
        throw e;
    }
    if (!vuelta) throw new Error('SIN_VUELTA');

    // La vuelta trae los parámetros en la query de una URL con esquema propio; `URL` la parsea igual.
    const params = new URL(vuelta).searchParams;
    if (params.get('error')) {
        if (params.get('error') === 'access_denied') return { cancelado: true };
        throw new Error(params.get('error'));
    }
    // El `state` cierra que la vuelta sea de ESTA petición y no de otra reinyectada.
    if (params.get('state') !== state) throw new Error('ESTADO_AJENO');
    const code = params.get('code');
    if (!code) throw new Error('SIN_CODIGO');
    return { code, codeVerifier, nonce, redirectUri: GOOGLE_IOS_REDIRECT };
}
