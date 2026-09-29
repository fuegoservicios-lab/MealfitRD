// [P1-PLAN-LOTE-900 · 2026-09-29] Lo que el coach cambió de la app en un turno, aplicado a la pantalla.
//
// El dueño, en modo voz: «Activa la hidratación» → el coach anotó un vaso de agua (no tenía con qué encender la
// tarjeta). «Quiero que si le pido cualquier cosa como esa que lo haga, quiero que tenga 100 % acceso a todo de la app».
// Ahora el backend (`ajustes_de_la_app.py`) escribe lo que vive en el servidor con las MISMAS funciones que
// Configuración, y el evento `done` del chat trae `ajustes_de_app`: aquí se hace lo que haría el interruptor en la
// pantalla (los espejos locales, el tema, el idioma, la navegación). Cada paso por separado: si uno falla, los demás
// siguen — el cambio ya está guardado en el servidor.
import { safeLocalStorageSet } from './safeLocalStorage';
import { applyThemePref } from './theme';

/** La ruta de una pantalla del coach. «Progreso» es el inicio en modo seguimiento y su propia pestaña con plan. */
export function rutaDePantalla(pantalla, { modoContador = false } = {}) {
    switch (pantalla) {
        case 'inicio': return '/dashboard';
        case 'progreso': return modoContador ? '/dashboard' : '/dashboard/progress';
        case 'agente': return '/dashboard/agent';
        case 'nevera': return '/dashboard/pantry';
        case 'recetas': return modoContador ? '/dashboard' : '/dashboard/recipes';
        case 'historial': return '/history';
        case 'configuracion': return '/dashboard/settings';
        default: return null;
    }
}

const avisarAlmacen = (win, clave, valor) => {
    // Mismo aviso que Configuración: el WaterTracker del panel escucha `storage` para aparecer o irse sin recargar.
    try { win.dispatchEvent(new win.StorageEvent('storage', { key: clave, newValue: valor })); } catch { /* sin evento */ }
};

const intentar = (fn) => { try { const r = fn(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch { /* sigue */ } };

/**
 * @param {object} ajustes  `done.ajustes_de_app`: { hidratacion, nevera, memoria, generador_de_planes, tenia_plan,
 *                          avisos_comida, avisos_agua, tema, idioma, pantalla, seccion }
 * @param {object} deps     { navigate, ubicacion, setLocale, guardarIdioma, updateData, refrescarPerfil,
 *                          restaurarPlan, sincronizarAvisos, pedirFormulario, modoContador, win }
 */
export function aplicarAjustesDelCoach(ajustes, deps = {}) {
    if (!ajustes || typeof ajustes !== 'object') return;
    const win = deps.win || (typeof window !== 'undefined' ? window : undefined);
    const a = ajustes;
    let refrescar = false;

    if (typeof a.hidratacion === 'boolean') {
        safeLocalStorageSet('mealfit_water_tracker_enabled', String(a.hidratacion));
        if (win) {
            avisarAlmacen(win, 'mealfit_water_tracker_enabled', String(a.hidratacion));
            intentar(() => win.dispatchEvent(new win.CustomEvent('mealfit:refresh-hydration')));
        }
    }
    if (typeof a.nevera === 'boolean') {
        // La pestaña de la Nevera sale del PERFIL del contexto (`neveraActiva`): el espejo + refrescarlo.
        safeLocalStorageSet('mealfit_nevera_activa', String(a.nevera));
        refrescar = true;
    }
    if (a.generador_de_planes === 'plan' || a.generador_de_planes === 'tracking') {
        safeLocalStorageSet('mealfit_plan_mode', a.generador_de_planes);
        intentar(() => deps.updateData?.('appMode', a.generador_de_planes));
        refrescar = true;
        // Con plan, el plan EN MEMORIA dice el estado viejo (franja de pausa, días en cola): se adopta entero. Sin
        // recargar la página, que cortaría el modo voz (Configuración sí recarga).
        if (a.tenia_plan) intentar(() => deps.restaurarPlan?.());
    }
    for (const clave of ['avisos_comida', 'avisos_agua']) {
        if (typeof a[clave] === 'boolean') {
            intentar(() => deps.updateData?.(clave, a[clave]));
            refrescar = true;
            intentar(() => deps.sincronizarAvisos?.());   // el teléfono reprograma con lo que diga el servidor
        }
    }
    if (a.tema === 'light' || a.tema === 'dark' || a.tema === 'system') {
        safeLocalStorageSet('mealfit_theme', a.tema);
        intentar(() => applyThemePref(a.tema));
    }
    if (typeof a.idioma === 'string' && a.idioma) {
        // Mismo orden que Configuración: el catálogo primero, y SOLO si cargó, el perfil (si no, el idioma volvería
        // solo al entrar la próxima vez).
        intentar(async () => {
            const ok = await deps.setLocale?.(a.idioma);
            if (ok === true) await deps.guardarIdioma?.(a.idioma);
        });
    }
    if (refrescar) intentar(() => deps.refrescarPerfil?.());

    if (a.pantalla === 'formulario') {
        // Encender los planes sin plan: el formulario (abrirlo no gasta; el crédito se usa al final).
        intentar(() => deps.pedirFormulario?.());
        intentar(() => deps.updateData?.('appMode', 'plan'));
        intentar(() => deps.navigate?.('/assessment'));
    } else if (a.pantalla) {
        const ruta = rutaDePantalla(a.pantalla, { modoContador: Boolean(deps.modoContador) });
        if (ruta === '/dashboard/settings') {
            // Como ventana sobre la pantalla actual (igual que el engranaje), en su sección si la pidió.
            const destino = a.seccion ? `${ruta}#${a.seccion}` : ruta;
            intentar(() => deps.navigate?.(destino, deps.ubicacion ? { state: { backgroundLocation: deps.ubicacion } } : undefined));
        } else if (ruta) {
            intentar(() => deps.navigate?.(ruta));
        }
    }
}
