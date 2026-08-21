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

import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
}

// Nombre del CONTRATO, no del mecanismo: lo que las superficies preguntan es «¿debo
// esconder el comercio?», no «¿estoy en iOS?». Si un día el comercio nativo existe
// (StoreKit), cambia esta función y no los 6 call sites.
export function nativeHidesCommerce() {
    return isNativeApp();
}

// Sign in with Apple (guideline 4.8: obligatorio si se ofrece Google). El provider se
// configura en Neon Auth cuando la membresía esté aprobada; hasta entonces el botón no
// se pinta. Env explícita, no derivada de `isNativeApp()`: el botón también debe verse
// en la web una vez exista el provider.
export function appleSignInEnabled() {
    return String(import.meta.env.VITE_AUTH_APPLE_ENABLED ?? '').toLowerCase() === 'true';
}
