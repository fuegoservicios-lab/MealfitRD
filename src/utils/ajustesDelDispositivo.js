// [P1-PLAN-LOTE-837 · 2026-09-29] Los ajustes DEL DISPOSITIVO, informados al servidor (spec 2026-09-29, §13.3).
//
// POR QUÉ. La ficha de una cuenta del panel enseña los ajustes que la persona deja encendidos o apagados, y casi todos
// viven en el servidor. Estos no: el tema, el permiso de notificaciones del SISTEMA, las alertas del dispositivo, el
// veto local de analítica, la barra plegada, la unidad de altura, el avatar, la plataforma (web / PWA / iOS / Android)
// y la versión viven SOLO en el teléfono. Sin que la app los cuente, «¿qué apaga la gente?» queda ciego justo donde más
// se toca.
//
// QUÉ SE MANDA. `PUT /api/profile/ajustes-dispositivo` con una LISTA CERRADA de claves (lo que no está en el contrato lo
// descarta el servidor, y aquí ni se lee): enumerados cortos y booleanos. Un ajuste es MODO DE USO, no contenido: el
// perfil de salud (peso, edad, sexo, alergias, dieta, condiciones, medicamentos) NO es un ajuste y no sale de aquí; ni
// siquiera el id del avatar (solo si eligió uno) ni el `mealfit_form` entero (solo su `_heightInputUnit`).
//
// CUÁNDO. A lo sumo UNA vez al día, salvo que cambie el tema o las alertas desde el último envío. El último envío se
// anota POR CUENTA (`mealfit_ajustes_dispositivo_enviado_at` + su instantánea): dos personas en el mismo teléfono no se
// tapan la una a la otra. Nunca bloquea ni lanza: un fallo se descarta en silencio, no se anota, y no se martillea al
// servidor (enfriamiento). Con el interruptor del servidor apagado, éste contesta `guardado: false` y aquí cuenta como
// enviado: una petición al día, no una por carga.
//
// DÓNDE VIVE LA DECISIÓN. Este módulo es toda la lógica; `ReporteAjustesDispositivo` (DashboardLayout, sin pantalla)
// solo decide CUÁNDO mirar. Nada de esto entra en AssessmentContext.jsx.
import { fetchWithAuth } from '../config/api';
import { isNativeApp, nativePluginAvailable } from '../config/platform';
import { contextoDelDispositivo } from '../consent/apiConsentimiento';
import { CLAVE_TABBAR_PLEGADA } from '../hooks/useTabBarPlegable';
import { CLAVE_APAGADA, pushNativaApagada } from '../native/pushNativa';
import { ANALYTICS_OPT_OUT_KEY } from './analytics';
import { CLAVE_AVISOS_LOCALES, CLAVE_PUSH_WEB, interruptorAlNacer } from './avisosDeComida';
import { getAvatarId } from './avatarStore';
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';
import { getStoredThemePref } from './theme';

export const RUTA_AJUSTES_DISPOSITIVO = '/api/profile/ajustes-dispositivo';
/** Cuándo (ms desde 1970) se aceptó el último envío. */
export const CLAVE_ENVIADO_AT = 'mealfit_ajustes_dispositivo_enviado_at';
/** `{ uid, tema, alertas }` del último envío aceptado: con qué comparar «¿cambió el tema o las alertas?». */
export const CLAVE_ULTIMO = 'mealfit_ajustes_dispositivo_ultimo';
/** Lo que este módulo vigila para enterarse de un cambio hecho en OTRA pestaña (evento `storage`). */
export const CLAVES_VIGILADAS = ['mealfit_theme', CLAVE_PUSH_WEB, CLAVE_AVISOS_LOCALES, CLAVE_APAGADA];

export const REENVIO_MS = 24 * 60 * 60 * 1000;        // a lo sumo una vez al día
export const ENFRIAMIENTO_MS = 10 * 60 * 1000;        // tras un fallo, no se reintenta antes de esto
export const ESPERA_INICIAL_MS = 3000;                // «tras el primer idle» (tope de requestIdleCallback y respaldo)
export const ESPERA_CAMBIO_MS = 4000;                 // junta ráfagas: el limitador del servidor es 6 por minuto
export const REVISION_MS = 60 * 1000;                 // el cambio de alertas en ESTA pestaña no emite ningún evento
const TOLERANCIA_RELOJ_MS = 5 * 60 * 1000;            // un «último envío» más futuro que esto no es creíble
const TOPE_PLUGIN_MS = 1500;                          // preguntarle el permiso al plugin nativo nunca cuelga

let _enVuelo = null;       // la petición en curso: dos llamadas a la vez comparten una
let _fallidoAt = null;     // cuándo falló el último intento (para el enfriamiento; solo en memoria)

/** Solo tests: vuelve al estado de arranque. */
export function _reiniciarAjustesDelDispositivoParaTests() {
    _enVuelo = null;
    _fallidoAt = null;
}

// ─────────────────────────────────────────────────────────────── lo que se lee del dispositivo
/** Las alertas, tal como las ve la persona: el interruptor de Configuración (web: permiso concedido Y suscrita; app
 *  nativa: el interruptor local) y, en la app, sin la marca de «apagué la push» de esta cuenta. */
function _alertasActivadas() {
    try {
        if (!interruptorAlNacer()) return false;
        return !(isNativeApp() && pushNativaApagada());
    } catch {
        return false;
    }
}

/** Promesa con tope: si el plugin no contesta a tiempo, `null`. El temporizador se suelta siempre. */
function _conTope(promesa, ms) {
    let temporizador;
    const tope = new Promise((resolve) => { temporizador = setTimeout(() => resolve(null), ms); });
    return Promise.race([promesa, tope]).finally(() => clearTimeout(temporizador));
}

/** `granted | denied | default | unsupported` del SISTEMA, o `undefined` si no se pudo leer (mejor callar que mentir).
 *  En la app nativa lo dice el plugin de notificaciones locales (el WKWebView de iOS no tiene `Notification`). */
async function _permisoDeNotificaciones() {
    try {
        if (isNativeApp()) {
            if (!nativePluginAvailable('LocalNotifications')) return 'unsupported';
            const modulo = await import('@capacitor/local-notifications');
            // El plugin es un Proxy: ni se devuelve ni se espera suelto (lote 135) — solo se le llama.
            const LN = modulo.LocalNotifications;
            if (!LN) return 'unsupported';
            const respuesta = await _conTope(LN.checkPermissions(), TOPE_PLUGIN_MS);
            const estado = respuesta && respuesta.display;
            if (estado === 'granted' || estado === 'denied') return estado;
            return estado ? 'default' : undefined;   // 'prompt' y 'prompt-with-rationale': aún no se ha decidido
        }
        if (typeof Notification === 'undefined') return 'unsupported';
        const permiso = Notification.permission;
        return permiso === 'granted' || permiso === 'denied' || permiso === 'default' ? permiso : undefined;
    } catch {
        return undefined;
    }
}

/** ¿Abierta como app instalada (PWA)? En la app nativa no: allí la plataforma ya dice qué es. */
function _esPwa() {
    try {
        if (isNativeApp()) return false;
        const modo = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)') : null;
        return (!!modo && modo.matches === true) || window.navigator.standalone === true;
    } catch {
        return false;
    }
}

/** `cm | ft` de la unidad con la que la persona escribió su altura, o `undefined`. Del `mealfit_form` solo se lee ESTA
 *  clave: el resto del formulario es perfil de salud y no sale de aquí. */
function _unidadDeAltura() {
    try {
        const crudo = safeLocalStorageGet('mealfit_form', null);
        if (!crudo) return undefined;
        const formulario = JSON.parse(crudo);
        const unidad = formulario && formulario._heightInputUnit;
        return unidad === 'cm' || unidad === 'ft' ? unidad : undefined;
    } catch {
        return undefined;
    }
}

/** El cuerpo del PUT: lista cerrada de claves del contrato. Nunca lanza. */
export async function leerAjustesDelDispositivo() {
    let contexto = {};
    try { contexto = (await contextoDelDispositivo()) || {}; } catch { contexto = {}; }
    const ajustes = {
        tema: getStoredThemePref(),
        alertas_activadas: _alertasActivadas(),
        analitica_vetada: safeLocalStorageGet(ANALYTICS_OPT_OUT_KEY, null) === '1',
        barra_plegada: safeLocalStorageGet(CLAVE_TABBAR_PLEGADA, null) === '1',
        avatar_elegido: !!getAvatarId(),
    };
    const permiso = await _permisoDeNotificaciones();
    if (permiso) ajustes.notificaciones_permiso = permiso;
    const unidad = _unidadDeAltura();
    if (unidad) ajustes.unidad_altura = unidad;
    const build = typeof contexto.app_build === 'string' ? contexto.app_build.slice(0, 64) : '';
    return {
        plataforma: contexto.platform === 'ios' || contexto.platform === 'android' ? contexto.platform : 'web',
        pwa: _esPwa(),
        ...(build ? { app_build: build } : {}),
        ajustes,
    };
}

// ─────────────────────────────────────────────────────────────── cuándo enviar
function _leerRegistro() {
    const en = Number(safeLocalStorageGet(CLAVE_ENVIADO_AT, null));
    let ultimo = null;
    try {
        const anotado = JSON.parse(safeLocalStorageGet(CLAVE_ULTIMO, 'null'));
        if (anotado && typeof anotado === 'object') ultimo = anotado;
    } catch { /* ilegible: como si no hubiera envío */ }
    return { enviadoAt: Number.isFinite(en) && en > 0 ? en : null, ultimo };
}

/** Decisión PURA: ¿toca enviar? Sí si nunca se envió (o el registro no se puede leer), si el último envío es de otra
 *  cuenta, si pasaron 24 h (o el reloj se movió y el envío quedó «en el futuro») o si cambió el tema o las alertas. */
export function hayQueEnviar({ ahora, enviadoAt, ultimo, uid, tema, alertas }) {
    if (!Number.isFinite(enviadoAt) || enviadoAt <= 0) return true;
    if (!ultimo || ultimo.uid !== uid) return true;
    if (enviadoAt > ahora + TOLERANCIA_RELOJ_MS) return true;
    if (ahora - enviadoAt >= REENVIO_MS) return true;
    return ultimo.tema !== tema || ultimo.alertas !== alertas;
}

async function _informar(uid, ahora) {
    try {
        const tema = getStoredThemePref();
        const alertas = _alertasActivadas();
        const { enviadoAt, ultimo } = _leerRegistro();
        if (!hayQueEnviar({ ahora, enviadoAt, ultimo, uid, tema, alertas })) return 'reciente';
        if (_fallidoAt !== null && ahora >= _fallidoAt && ahora - _fallidoAt < ENFRIAMIENTO_MS) return 'enfriando';
        const cuerpo = await leerAjustesDelDispositivo();
        const res = await fetchWithAuth(RUTA_AJUSTES_DISPOSITIVO, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
        });
        if (!res || !res.ok) {
            _fallidoAt = ahora;
            return 'fallo';
        }
        _fallidoAt = null;
        safeLocalStorageSet(CLAVE_ENVIADO_AT, String(ahora));
        safeLocalStorageSet(CLAVE_ULTIMO, JSON.stringify({
            uid,
            tema: cuerpo.ajustes.tema,
            alertas: cuerpo.ajustes.alertas_activadas,
        }));
        return 'enviado';
    } catch {
        _fallidoAt = ahora;
        return 'fallo';
    }
}

/**
 * Informa los ajustes del dispositivo si toca. Resuelve SIEMPRE (nunca rechaza) con el motivo:
 * `enviado` | `reciente` (nada que decir aún) | `enfriando` (falló hace poco) | `fallo` | `sin_sesion`.
 * `ahora` es solo para las pruebas.
 */
export function informarAjustesDelDispositivo({ uid, ahora = Date.now() } = {}) {
    if (!uid) return Promise.resolve('sin_sesion');
    if (_enVuelo) return _enVuelo;
    _enVuelo = _informar(uid, ahora).finally(() => { _enVuelo = null; });
    return _enVuelo;
}

/** Ejecuta `fn` en el primer momento de reposo (Safari y el WKWebView no tienen `requestIdleCallback`: `setTimeout`).
 *  Devuelve la función que lo cancela. */
export function alPrimerIdle(fn) {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(fn, { timeout: ESPERA_INICIAL_MS });
        return () => {
            try { if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id); } catch { /* ya corrió */ }
        };
    }
    const id = setTimeout(fn, ESPERA_INICIAL_MS);
    return () => clearTimeout(id);
}
