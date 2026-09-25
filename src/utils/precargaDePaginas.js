// [P1-PLAN-LOTE-320 · 2026-09-25] Precarga de las páginas del menú inferior.
//
// El dueño: «a veces se tarda mucho en pasar del Agente a la Nevera». Medido en el arnés con build de producción
// (CPU ×4): en caliente la Nevera sale en 60-90 ms, pero la PRIMERA visita tardaba 622 ms —descargar/compilar el
// código de la página y montarla por primera vez, con la pantalla de carga delante—. Cada página se importa una sola
// vez (la MISMA promesa para `lazy` y para la precarga) y, en cuanto el dashboard queda en reposo, se piden todas:
// la primera visita encuentra el código ya listo.
// La promesa, al cumplirse, lleva `status`/`value` (el protocolo de thenables de React 19): cuando `lazy` la lanza en la
// primera visita, React ve que YA está cumplida y repite el render en el acto, sin pasar por la pantalla de carga.
// Sin esa marca, aun con el código precargado, el <Suspense> enseñaba su fallback (medido en el arnés).
const unaVez = (fn) => {
    let promesa = null;
    return () => {
        if (!promesa) {
            const p = fn().then(
                (modulo) => { p.status = 'fulfilled'; p.value = modulo; return modulo; },
                (error) => { promesa = null; throw error; },   // un fallo de red se reintenta
            );
            promesa = p;
        }
        return promesa;
    };
};

/** Solo para los tests. */
export const _unaVez = unaVez;

export const cargarPagina = {
    hoy: unaVez(() => import('../pages/Dashboard')),
    progreso: unaVez(() => import('../pages/ProgressPage')),
    agente: unaVez(() => import('../pages/AgentPage')),
    nevera: unaVez(() => import('../pages/Pantry')),
    historial: unaVez(() => import('../pages/History')),
};

let programada = false;

/** Pide el código de las páginas del menú cuando el navegador está en reposo (nunca compite con lo que se ve). */
export function precargarPaginasDelMenu() {
    if (programada) return;
    programada = true;
    try { if (navigator?.connection?.saveData) return; } catch { /* sin Network Information API */ }
    const pedir = () => {
        for (const k of Object.keys(cargarPagina)) cargarPagina[k]().catch(() => { /* la visita real lo reintenta */ });
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(pedir, { timeout: 5000 });
    else setTimeout(pedir, 2500);   // Safari / WKWebView no tienen requestIdleCallback
}
