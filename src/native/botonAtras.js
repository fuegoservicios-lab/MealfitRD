// [P1-PLAN-LOTE-163 · 2026-09-22] El gesto «atrás» de Android.
//
// La auditoría de la beta lo encontró por dos lados a la vez: el APK no traía `@capacitor/app` y el `BridgeActivity`
// de Capacitor 8 no maneja el botón atrás. Sin nadie que lo escuche, Android hace lo suyo: manda la app al fondo
// (Android 12+) o la CIERRA (11 y anteriores, perdiendo lo escrito) — desde cualquier pantalla, con un modal abierto,
// en mitad del formulario. Los oyentes de `popstate` del formulario y del login existían, pero solo funcionaban en
// Chrome: en el APK el gesto nunca llegaba a la web.
//
// La decisión, en orden:
//   1. Hay un diálogo abierto → se cierra, por el MISMO camino que la tecla Escape (`useModalAccessibility` escucha
//      en `document` y solo contesta el de más arriba; así también pasan por su puerta de salida los que la tienen,
//      como Configuración con cambios sin guardar).
//   2. Estás en una pestaña raíz → la app se minimiza, igual que cualquier app de Android en su pantalla principal.
//      Sin esta regla el formulario, que deja unas diez entradas de historial en `/assessment`, rebotaría al panel
//      una vez por entrada.
//   3. Hay historial → `history.back()` (el formulario retrocede un paso; el login vuelve del código al correo).
//   4. Si no → se minimiza.
//
// El plugin se usa DENTRO de la función, nunca se devuelve desde una `async`: es un Proxy y el motor le leería `.then`
// (la trampa del lote 133). Todo pregunta antes al binario (`nativePluginAvailable`): un APK anterior sin el plugin
// recibe este JS por OTA y simplemente no hace nada.
import { isNativeApp, nativePluginAvailable } from '../config/platform';

export const RUTAS_RAIZ = Object.freeze([
    '/dashboard', '/dashboard/progress', '/dashboard/agent', '/dashboard/pantry', '/dashboard/recipes', '/history',
]);

/** Pura: qué hacer con el gesto. `'cerrar-modal' | 'minimizar' | 'volver'`. */
export function decidirAtras({ hayModal = false, ruta = '', puedeVolver = false } = {}) {
    if (hayModal) return 'cerrar-modal';
    const r = String(ruta || '').replace(/\/+$/, '') || '/';
    if (RUTAS_RAIZ.includes(r)) return 'minimizar';
    if (puedeVolver) return 'volver';
    return 'minimizar';
}

const _SELECTOR_DIALOGO = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';

export function hayDialogoAbierto(doc = document) {
    try { return !!doc.querySelector(_SELECTOR_DIALOGO); } catch { return false; }
}

export function cerrarDialogoDeArriba(doc = document) {
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
}

let _iniciado = false;

export async function iniciarBotonAtras() {
    if (_iniciado || !isNativeApp() || !nativePluginAvailable('App')) return;
    _iniciado = true;
    try {
        const mod = await import('@capacitor/app');
        const App = mod.App;
        await App.addListener('backButton', (evento) => {
            const accion = decidirAtras({
                hayModal: hayDialogoAbierto(),
                ruta: window.location.pathname,
                puedeVolver: !!evento?.canGoBack,
            });
            if (accion === 'cerrar-modal') cerrarDialogoDeArriba();
            else if (accion === 'volver') window.history.back();
            else App.minimizeApp().catch(() => { /* iOS no tiene botón atrás: nunca llega aquí */ });
        });
    } catch {
        _iniciado = false;   // sin plugin o sin listener: el gesto hace lo de siempre, y un reintento puede servir
    }
}
