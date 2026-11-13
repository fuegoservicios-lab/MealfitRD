// [P1-PLAN-LOTE-994 · 2026-11-13] La ventanita nativa de valoración («¿Te gusta Bioboros?», estrellas sin salir).
//
// La App Store no muestra estrellas hasta que la app junta un mínimo de valoraciones en ese país, y la app no se lo
// pedía a nadie: sólo valoraba quien entraba a la tienda por su cuenta. Se pide en un momento BUENO: justo después de
// registrar una comida, y sólo a quien ya la usa de verdad (comidas registradas en `DIAS_MINIMOS` días distintos).
//
// Apple (SKStoreReviewController) y Google (In-App Review) deciden por su cuenta si la enseñan: Apple como mucho 3
// veces al año por persona, y no avisan si la mostraron. Por eso aquí hay un tope propio (`ESPERA_DIAS` entre
// pedidos): si no, se gastarían las 3 en una semana con el primer usuario constante.
//
// El JS llega por OTA a binarios sin el plugin: todo pregunta antes (`nativePluginAvailable`) y, sin él, no hace nada.
// El plugin se usa DENTRO de la función y jamás se devuelve desde una `async` (es un Proxy: la trampa del lote 133).
import { isNativeApp, nativePluginAvailable } from '../config/platform';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';

export const DIAS_MINIMOS = 3;
export const ESPERA_DIAS = 120;
const RETRASO_MS = 2500;
const CLAVE_DIAS = 'mealfit_valoracion_dias';
const CLAVE_ULTIMA = 'mealfit_valoracion_ultima';
const _DIA_MS = 86400000;

/** Pura: ¿toca pedir la valoración ahora? */
export function debePedir({ diasConRegistro = 0, ultimaVez = 0, ahora = Date.now() } = {}) {
    if (diasConRegistro < DIAS_MINIMOS) return false;
    return !ultimaVez || ahora - ultimaVez >= ESPERA_DIAS * _DIA_MS;
}

/** Pura: añade `hoy` a la lista de días con registro (sin repetir, máx. 10). */
export function anotarDia(dias, hoy) {
    const lista = Array.isArray(dias) ? dias.filter((d) => typeof d === 'string') : [];
    if (!lista.includes(hoy)) lista.push(hoy);
    return lista.slice(-10);
}

function _leerDias() {
    try { return JSON.parse(safeLocalStorageGet(CLAVE_DIAS) || '[]'); } catch { return []; }
}

function _hoyLocal(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function _pedir() {
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
}

let _iniciado = false;

export function iniciarPedirValoracion() {
    if (_iniciado || !isNativeApp() || !nativePluginAvailable('InAppReview')) return;
    _iniciado = true;
    // El evento sale con CADA cambio de la lista de hoy (carga inicial, refetch, borrado): sólo cuenta cuando CRECE
    // respecto a lo ya visto en esta sesión — la carga inicial fija la base y no pide nada.
    let vistas = null;
    let diaVisto = null;
    window.addEventListener('mealfit:today-consumed-updated', (e) => {
        const n = Array.isArray(e?.detail?.meals) ? e.detail.meals.length : 0;
        const hoy = _hoyLocal();
        if (diaVisto !== hoy) { diaVisto = hoy; vistas = null; }
        const crecio = vistas !== null && n > vistas;
        vistas = n;
        if (n <= 0) return;
        const dias = anotarDia(_leerDias(), hoy);
        safeLocalStorageSet(CLAVE_DIAS, JSON.stringify(dias));
        if (!crecio) return;
        const ultimaVez = Number(safeLocalStorageGet(CLAVE_ULTIMA) || 0);
        if (!debePedir({ diasConRegistro: dias.length, ultimaVez })) return;
        safeLocalStorageSet(CLAVE_ULTIMA, String(Date.now()));
        // Un respiro para que el usuario vea su comida registrada antes de la ventanita.
        setTimeout(() => { _pedir().catch(() => {}); }, RETRASO_MS);
    });
}
