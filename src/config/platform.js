// [P1-IOS-NATIVE-SHELL · 2026-08-21] EL ÚNICO gate de plataforma del frontend.
//
// Bioboros se distribuye también como app nativa (Capacitor → App Store). Apple
// (guidelines 3.1.1 / 3.1.3(b)) prohíbe que la app venda o ENLACE a compras externas:
// el pago es sólo web (PayPal) y la app nativa se limita a REFLEJAR el tier contratado
// fuera. Por eso en nativo no existe ninguna superficie de comercio: ni precios, ni
// «Mejorar plan», ni PayPal, ni el landing de marketing.
//
// Regla: ninguna superficie decide por su cuenta si está en nativo. Todas importan este
// módulo. Es la lección de `CAMPOS_DERIVADOS_DEL_SERVIDOR` (AssessmentContext): cuando la
// misma condición se copia a mano en N sitios, el bug es que hay N.
//
// `isNativeApp()` es una FUNCIÓN y no una constante de módulo a propósito: los tests la
// mockean, y una constante evaluada al importar no se puede mockear después
// (la «trampa del const congelado», memoria 2026-08-19/20).
//
// Spec: docs/superpowers/specs/2026-08-21-ios-native-shell-design.md
// tooltip-anchor: isNativeApp (test_p1_ios_native_shell.py, NativeShell.contract.test.jsx)

import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { registerNativeProbe } from './site';

export function isNativeApp() {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
}

// [P1-PLAN-LOTE-162 · 2026-09-22] 'ios' | 'android' | 'web'. Solo para COPY que depende del sistema (dónde está
// el permiso bloqueado, qué menú abrir): las decisiones de producto siguen preguntando por CAPACIDAD
// (`nativePluginAvailable`, `nativeHidesCommerce`), nunca por plataforma. Configuración le decía a un tester de
// Android «Permiso bloqueado en el iPhone… Ajustes → Notificaciones».
export function nativePlatform() {
    try {
        return Capacitor.getPlatform();
    } catch {
        return 'web';
    }
}

// [P1-LEGAL-LINKS-APEX · 2026-08-22] `apexUrl()` (site.js) necesita saber si está
// en nativo pero NO puede importar este módulo (site.js también corre en Node, sin
// Capacitor). Se le inyecta la sonda al cargar platform.js, que sólo vive en el bundle.
registerNativeProbe(isNativeApp);

// [P1-PLAN-LOTE-108] GET por la pila NATIVA (no pasa por el WebView, así que no hay
// CORS): lo usa `native/liveUpdate.js` para leer el manifiesto OTA, que es un estático
// de nginx y no manda cabeceras CORS a `capacitor://localhost`. Vive aquí porque este
// módulo es el único que habla con `@capacitor/core` (NativeShell.contract.test.jsx).
export function nativeHttpGet(options) {
    return CapacitorHttp.get(options);
}

// [P1-PLAN-LOTE-133] ¿Este BINARIO trae el plugin nativo `name`? El JS llega por OTA a binarios anteriores al plugin:
// quien lo use pregunta aquí antes de importarlo (los avisos locales muestran «Actualiza la app…» en vez de romperse).
export function nativePluginAvailable(name) {
    try {
        return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(name);
    } catch {
        return false;
    }
}

// [P1-PLAN-LOTE-146] Registrar un plugin LOCAL del binario (los que viven en SceneDelegate.swift, no en un
// paquete npm). Vive aquí por la misma razón que `nativeHttpGet`: este módulo es el único que habla con
// `@capacitor/core`. **Llamarlo a nivel de MÓDULO y devolverlo tal cual**: lo que vuelve es un Proxy, y si
// sale de una función `async` el motor le lee `.then` y la promesa se cuelga para siempre (lección del lote 133).
export function registrarPluginNativo(name) {
    return registerPlugin(name);
}

// Nombre del CONTRATO, no del mecanismo: lo que las superficies preguntan es «¿debo
// esconder el comercio?», no «¿estoy en iOS?». Si un día el comercio nativo existe
// (StoreKit), cambia esta función y no los 6 call sites.
export function nativeHidesCommerce() {
    return isNativeApp();
}

// [P1-IOS-OAUTH-GATE · 2026-08-22] OAuth por REDIRECCIÓN (Google) no vuelve a la app
// nativa: Neon Auth redirige al `callbackURL`, que en el WebView es
// `capacitor://localhost/dashboard`, y Safari lo rechaza («la dirección no es válida»
// — medido en el primer build de TestFlight). Arreglarlo de verdad es un esquema de URL
// propio (deep link) + intercambio del código en el backend: diseño, no parche. Mientras
// no exista, el botón no se pinta: un revisor de Apple pulsaría justo ese botón. Gate
// PROPIO (no reusar `nativeHidesCommerce`): cuando llegue el deep link se apaga sólo
// éste y el comercio sigue escondido.
export function nativeHidesOAuthRedirect() {
    // [P1-PLAN-LOTE-147 · 2026-09-21] …y ese día llegó. Con el plugin `MfWebAuth` en el binario, Google ya NO va por
    // una redirección que no vuelve: va por `ASWebAuthenticationSession`, que captura la vuelta ella misma. El gate
    // sigue siendo UNO y el JSX del login no cambia; lo que cambia es la respuesta.
    if (googleSignInNativo()) return false;
    return isNativeApp();
}

// ¿El botón de Google va por un mecanismo del BINARIO (true) o por la redirección de Better Auth (false)?
//
// [P1-PLAN-LOTE-160 · 2026-09-22] Dos mecanismos, un solo gate. iOS trae `MfWebAuth` (código + PKCE sobre
// una vista web del sistema); Android trae `MfGoogleId` (Credential Manager, que entrega el token ya
// emitido) porque Google retiró los esquemas propios como destino de redirección en Android.
//
// Las superficies preguntan «¿ofrezco Google sin redirección?», no «¿en qué plataforma estoy?». Por eso la
// respuesta es un OR y no un `isIOS()`: un binario viejo de cualquiera de las dos, sin su plugin, contesta
// false y cae solo al camino web — que es lo correcto, no un caso a evitar.
export function googleSignInNativo() {
    return nativePluginAvailable('MfWebAuth') || nativePluginAvailable('MfGoogleId');
}

// ¿Cuál de los dos? Solo lo pregunta el login, para elegir el módulo; nadie más debería necesitarlo.
export function googleSignInPorCredentialManager() {
    return nativePluginAvailable('MfGoogleId');
}

// Sign in with Apple (guideline 4.8: obligatorio si se ofrece Google). El provider se
// configura en Neon Auth cuando la membresía esté aprobada; hasta entonces el botón no
// se pinta. Env explícita, no derivada de `isNativeApp()`: el botón también debe verse
// en la web una vez exista el provider.
export function appleSignInEnabled() {
    // [P1-PLAN-LOTE-146 · 2026-09-20] En la app nativa NO decide la env: decide el BINARIO. El botón va por el
    // plugin local `MfAppleSignIn` (hoja de Apple + canje en nuestro backend), así que un binario que lo trae
    // puede ofrecerlo aunque la web no, y uno anterior nunca lo pinta. El gate sigue siendo UNO: las superficies
    // preguntan «¿ofrezco Apple?» y no «¿qué mecanismo hay detrás?» — eso lo contesta `appleSignInNativo()`.
    if (appleSignInNativo()) return true;
    return String(import.meta.env.VITE_AUTH_APPLE_ENABLED ?? '').toLowerCase() === 'true';
}

// ¿El botón de Apple va por el SDK del binario (true) o por la redirección web de Better Auth (false)?
export function appleSignInNativo() {
    return nativePluginAvailable('MfAppleSignIn');
}
