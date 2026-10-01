import { safeLocalStorageSet } from './safeLocalStorage';

/** Avisar a las tarjetas de cambios guardados, sin recargar la página ni inventar valores. */
export function aplicarCambiosDeVoz(n, { win = window, restaurarPlan, refrescarPerfil } = {}) {
    const avisar = (tipo, detail) => { try { win.dispatchEvent(new win.CustomEvent(tipo, { detail })); } catch { /* sigue */ } };
    const intentar = (fn) => { try { fn?.()?.catch?.(() => {}); } catch { /* los demás cambios siguen */ } };
    if (n?.turno_completo !== false) avisar('mealfit:chat-turn-done');
    else {
        if (n?.agua) avisar('mealfit:refresh-hydration');
        if (n?.diario) avisar('mealfit:refresh-inventory');
    }
    if (n?.nevera && !n?.diario) avisar('mealfit:refresh-inventory');
    if (n?.pantry_modified_at) {
        safeLocalStorageSet('mealfit_pantry_dirty_at', String(n.pantry_modified_at));
        avisar('mealfit:pantry-dirty', { at: n.pantry_modified_at });
    }
    if (n?.plan) intentar(restaurarPlan);
    if (n?.perfil) intentar(refrescarPerfil);
}
