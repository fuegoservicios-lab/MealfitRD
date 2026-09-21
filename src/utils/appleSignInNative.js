// [P1-PLAN-LOTE-146 · 2026-09-20] «Continuar con Apple» en la app de iOS, por el SDK nativo.
//
// Neon Auth no ofrece Apple como proveedor, y el OAuth por redirección no vuelve a la app nativa
// (`P1-IOS-OAUTH-GATE`). El binario trae un plugin LOCAL (`MfAppleSignIn`, en SceneDelegate.swift) que abre la hoja
// de Apple y devuelve el identity token; aquí se prepara el nonce y se canjea en NUESTRO backend, que es quien
// verifica la firma y emite la sesión (`signInWithAppleFirstParty`). La web no decide nada.
//
// El botón solo existe donde puede funcionar: `appleNativeAvailable()` pregunta por el plugin, así que un binario
// anterior —o el navegador— no lo pinta. Y el backend lo tiene apagado por knob hasta que ese build exista.
import { registerPlugin } from '@capacitor/core';
import { nativePluginAvailable } from '../config/platform';

// A nivel de MÓDULO y jamás devuelto desde una función `async`: un plugin de Capacitor es un Proxy, el motor le lee
// `.then` al resolver la promesa y se cuelga para siempre (la trampa del lote 133).
const MfAppleSignIn = registerPlugin('MfAppleSignIn');

export function appleNativeAvailable() {
    return nativePluginAvailable('MfAppleSignIn');
}

const aHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function nuevoNonce() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return aHex(bytes);
}

export async function sha256Hex(texto) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return aHex(new Uint8Array(digest));
}

/**
 * Abre la hoja de Apple. Devuelve `{ identityToken, nonce, name }` —`nonce` es el CRUDO, el que verifica el
 * backend; a Apple se le da su SHA-256— o `{ cancelado: true }` si la persona cerró la hoja (no es un error).
 */
export async function pedirCredencialDeApple() {
    const nonce = nuevoNonce();
    const hash = await sha256Hex(nonce);
    try {
        const r = await MfAppleSignIn.authorize({ nonce: hash });
        if (!r?.identityToken) throw new Error('SIN_TOKEN');
        return { identityToken: r.identityToken, nonce, name: (r.name || '').trim() };
    } catch (e) {
        if (e?.code === 'CANCELADO') return { cancelado: true };
        throw e;
    }
}
