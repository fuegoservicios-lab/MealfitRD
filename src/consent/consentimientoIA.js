// [P1-PLAN-LOTE-844 · 2026-09-29] El permiso para mandar datos a la IA de terceros, del lado de la app.
//
// POR QUÉ. App Review 5.1.2(i) (texto de nov-2025) exige nombrar a cada IA de terceros y pedir permiso explícito
// ANTES de que le llegue un dato personal; el revisor lo prueba sobre una instalación limpia. El RGPD pide además un
// consentimiento aparte para los datos de salud (art. 9.2.a) y otro para la transferencia a China (art. 49.1.a).
// Auditoría 2026-09-29, fila 4 y §A.1; el backend (Task 843) responde 428 `ai_consent_required` sin permiso.
//
// LAS DOS CAPAS, y por qué hacen falta las dos:
//   1. Cada punto de entrada con IA (formulario, coach, voz, bot de ayuda, escáneres, anotar por texto, cambiar plato,
//      regenerar, arreglar sodio, reintentar) pregunta ANTES de llamar:
//          if (faltaPermisoIA() && !(await asegurarConsentimientoIA())) return;
//      `faltaPermisoIA()` es síncrona a propósito: solo espera cuando SABE que falta, así que con el permiso dado (o
//      mientras aún no se sabe) el camino de siempre no gana ni un tick.
//   2. `fetchWithAuth` intercepta CUALQUIER 428 (`resolverPermisoRequerido`): abre la hoja y, si se acepta, repite la
//      petición UNA vez. Cubre lo que la capa 1 no ve: la primera acción antes de que cargue el perfil, el permiso
//      retirado en otro dispositivo o una versión nueva del texto. El 503 `ai_consent_unavailable` NO abre la hoja: es
//      «no pudimos leer tu permiso», no «no lo tienes».
//
// «Sin saber» NO es «sin permiso»: una cuenta cuyo perfil aún no llegó pasa, y decide el servidor (428 → hoja). Así el
// frontend jamás bloquea a alguien que ya aceptó, y el backend jamás deja pasar a quien no.
//
// QUIÉN. El host (`ConsentimientoIAHost`, montado en App.jsx) dice quién usa la app —cuenta o invitado— y le pasa
// `profile.ai_consent`. El permiso de una CUENTA vive solo en el servidor (aquí, en memoria): en el dispositivo no se
// guarda nada suyo, y una petición con sesión nunca lleva la cabecera. El INVITADO sí guarda el suyo en el dispositivo
// (`mealfit_ai_consent`), atado a SU `session_id` —el siguiente «Probar sin cuenta» es otra persona posible y se le
// vuelve a preguntar— y se borra en cuanto está rancio: otra versión, un 428, o al entrar la sesión (de él solo queda
// su `session_id`, una hora, para que la adopción de su plan pase el permiso a la cuenta con su fecha).
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { t } from '../i18n';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../utils/safeLocalStorage';
import { getGuestSessionId } from '../utils/guestMode';
import { fijarPermisoAnalitica, persistAnalyticsOptOut } from '../utils/analytics';
import { AI_CONSENT_STORAGE_KEY, AI_CONSENT_VERSION } from './version';
import { API_BASE, fijarGanchosIA } from '../config/api';
import { cabeceraDelInvitado, permisoLocalVigente, titularDelDispositivo } from './cabecera';
import {
    PERMISO_REQUERIDO,
    concederPermisoIA,
    concederPermisoIAInvitado,
    leerPermisoIA,
    retirarPermisoIA,
} from './apiConsentimiento';

/** «Ahora no» a la hoja que sale sola al abrir la app: no se vuelve a abrir sola para esta versión y esta cuenta. */
const CLAVE_POSPUESTA = 'mealfit_ai_consent_snooze';
/** El `session_id` del invitado que acaba de entrar en una cuenta: NO es un permiso (no da cabecera), solo el dato
 *  que `/adopt-guest-plan` necesita para pasar su permiso a la cuenta. Caduca en una hora. */
const CLAVE_ADOPCION = 'mealfit_ai_consent_adopcion';
const ADOPCION_VALIDA_MS = 60 * 60 * 1000;

let _titular = null;      // 'invitado' | 'cuenta:<uid>' | null — lo fija el host
let _cuenta = null;       // lo que dice el servidor de ESA cuenta: { uid, vigente, version, at, revocadoEn, analytics }
let _instantanea = null;  // lo que leen los componentes (estable entre cambios, para useSyncExternalStore)
const _oyentes = new Set();
let _peticion = null;     // la hoja pedida: { promesa, resolver, automatica }
let _host = null;         // quien la dibuja
// [ronda 1] Cada decisión de aquí (aceptar, retirar, un 428) sube el contador: un GET /api/consents que salió ANTES
// llega viejo y no se aplica. `_concedidoEn` es cuándo se dio el permiso: un 428 de una petición que salió antes no
// lo cancela.
let _decisiones = 0;
let _concedidoEn = 0;

// ─────────────────────────────────────────────────────────────── estado
const _ms = (iso) => {
    const n = Date.parse(iso || '');
    return Number.isFinite(n) ? n : 0;
};
const _ultimaDecision = (c) => Math.max(_ms(c && c.at), _ms(c && c.revocadoEn));

function _titularEfectivo() {
    if (_titular) return _titular;
    const d = titularDelDispositivo();
    if (!d) return null;
    return d.startsWith('invitado:') ? 'invitado' : d;
}

function _uidDe(titular) {
    return titular && titular.startsWith('cuenta:') ? titular.slice('cuenta:'.length) : null;
}

function _calcular() {
    const vacio = { tipo: null, vigente: null, aceptadoEn: null, version: null, revocadoEn: null, analytics: null };
    if (_titular === 'invitado') {
        const r = permisoLocalVigente();
        return {
            ...vacio,
            tipo: 'invitado',
            vigente: !!r,
            aceptadoEn: r ? r.at || null : null,
            version: r ? r.v : null,
            analytics: r && typeof r.analytics === 'boolean' ? r.analytics : null,
        };
    }
    const uid = _uidDe(_titular);
    if (!uid) return vacio;
    if (!_cuenta || _cuenta.uid !== uid) return { ...vacio, tipo: 'cuenta' };
    return {
        tipo: 'cuenta',
        vigente: _cuenta.vigente,
        aceptadoEn: _cuenta.at,
        version: _cuenta.version,
        revocadoEn: _cuenta.revocadoEn,
        analytics: _cuenta.analytics,
    };
}

function _igual(a, b) {
    if (!a || !b) return false;
    return Object.keys(a).every((k) => a[k] === b[k]);
}

function _emitir() {
    const nueva = _calcular();
    // [P1-PLAN-LOTE-847] El permiso de analítica ANOTADO (cuenta o registro del invitado) llega a la regla única de
    // `analytics.js`, que arranca o para PostHog y el replay. Solo `true` cuenta: NULL (cuenta vieja) no es permiso.
    fijarPermisoAnalitica(nueva.analytics === true);
    if (_igual(nueva, _instantanea)) return;
    _instantanea = nueva;
    _oyentes.forEach((fn) => {
        try { fn(); } catch { /* un oyente roto no tumba al resto */ }
    });
}

/** Lo que se sabe del permiso: `vigente` true (sí), false (no) o null (aún no se sabe → decide el servidor). */
export function estadoConsentimientoIA() {
    if (!_instantanea) _instantanea = _calcular();
    return _instantanea;
}

/** Para `useSyncExternalStore` (useConsentimientoIA). Devuelve la baja. */
export function suscribirConsentimientoIA(fn) {
    _oyentes.add(fn);
    return () => _oyentes.delete(fn);
}

/** Lo que se sabe del permiso, como estado de React: `vigente` true / false / null (aún no se sabe), `aceptadoEn`,
 *  `version`, `revocadoEn`, `analytics` y `tipo` ('cuenta' | 'invitado'). Vive aquí y no en un fichero propio: un
 *  trozo más compartido por el panel y Configuración era un nombre más en la carga inicial (techo del arranque). */
export function useConsentimientoIA() {
    return useSyncExternalStore(suscribirConsentimientoIA, estadoConsentimientoIA, estadoConsentimientoIA);
}

/** ¿Se SABE que falta el permiso? Síncrona: se calcula en el momento (el invitado puede haber rotado de sesión). */
export function faltaPermisoIA() {
    return _calcular().vigente === false;
}

// ─────────────────────────────────────────────────────────────── el permiso del invitado en el dispositivo
function _leerRegistro() {
    try {
        const r = JSON.parse(safeLocalStorageGet(AI_CONSENT_STORAGE_KEY, 'null'));
        return r && typeof r === 'object' ? r : null;
    } catch {
        return null;
    }
}

/** El `session_id` del registro del invitado, solo si es de ESTA versión y de la sesión de invitado ACTUAL: el permiso
 *  de otro «Probar sin cuenta» no viaja a la adopción. Si ya no hay sesión de invitado (la borra la entrada de la
 *  cuenta, a veces antes de que el host se entere), el registro es el del invitado que acaba de entrar. */
function _sidDeInvitadoVigente() {
    const r = _leerRegistro();
    const quien = r && typeof r.quien === 'string' ? r.quien : '';
    if (!r || r.v !== AI_CONSENT_VERSION || !quien.startsWith('invitado:')) return null;
    const sid = quien.slice('invitado:'.length);
    const actual = safeLocalStorageGet('mealfit_guest_session_id', null);
    return sid && (!actual || actual === sid) ? sid : null;
}

function _olvidarPermisoDeInvitado() {
    safeLocalStorageRemove(AI_CONSENT_STORAGE_KEY);
}

/** Entró una sesión: el permiso del invitado deja de valer como tal (una cuenta nunca manda la cabecera). De él solo
 *  queda su `session_id`, una hora, para la adopción del plan. */
function _pasarPermisoDeInvitadoALaAdopcion() {
    const sid = _sidDeInvitadoVigente();
    if (sid) safeLocalStorageSet(CLAVE_ADOPCION, JSON.stringify({ sid, at: Date.now() }));
    _olvidarPermisoDeInvitado();
}

function _sidParaAdoptar() {
    try {
        const a = JSON.parse(safeLocalStorageGet(CLAVE_ADOPCION, 'null'));
        if (a && typeof a.sid === 'string' && a.sid && Date.now() - Number(a.at) < ADOPCION_VALIDA_MS) return a.sid;
    } catch { /* ilegible: como si no hubiera */ }
    // La adopción puede salir antes de que el host se entere de la sesión: el registro del invitado aún está.
    return _sidDeInvitadoVigente();
}

function _escribirPermisoDeInvitado({ sid, at, analytics }) {
    safeLocalStorageSet(AI_CONSENT_STORAGE_KEY, JSON.stringify({
        v: AI_CONSENT_VERSION,
        at: at || new Date().toISOString(),
        quien: `invitado:${sid}`,
        analytics: typeof analytics === 'boolean' ? analytics : null,
    }));
}

// ─────────────────────────────────────────────────────────────── la cuenta (solo en memoria)
function _desdeServidor(uid, e) {
    return {
        uid,
        vigente: !!e && e.vigente === true,
        version: e && typeof e.ai_consent_version === 'string' ? e.ai_consent_version : null,
        at: (e && e.ai_consent_at) || null,
        revocadoEn: (e && e.ai_consent_revoked_at) || null,
        analytics: e && typeof e.analytics === 'boolean' ? e.analytics : null,
    };
}

function _aplicarCuenta(c) {
    _cuenta = c;
    // El servidor dice que esta cuenta NO puede usar la IA: cualquier permiso de invitado que quede en el dispositivo
    // está rancio. Si la sesión caducara, el backend la trataría como invitada, y ese permiso no puede colarla.
    if (!c.vigente) _olvidarPermisoDeInvitado();
    _emitir();
}

/** El host dice quién usa la app. Otra cuenta ⇒ lo sabido de la anterior ya no vale. */
export function fijarTitularConsentimientoIA({ uid = null, invitado = false } = {}) {
    const nuevo = uid ? `cuenta:${uid}` : (invitado ? 'invitado' : null);
    if (nuevo === _titular) return;
    _titular = nuevo;
    if (uid) _pasarPermisoDeInvitadoALaAdopcion();
    if (_cuenta && _cuenta.uid !== uid) _cuenta = null;
    _emitir();
}

/** `profile.ai_consent` de GET /api/profile. Gana la decisión MÁS RECIENTE: un perfil leído antes de aceptar o de
 *  retirar aquí mismo no la pisa (el perfil en memoria no se refresca tras el POST). */
export function sincronizarConsentimientoIADesdePerfil(uid, aiConsent) {
    if (!uid || !aiConsent || typeof aiConsent !== 'object' || typeof aiConsent.vigente !== 'boolean') return;
    const nuevo = _desdeServidor(uid, aiConsent);
    if (_cuenta && _cuenta.uid === uid && _ultimaDecision(_cuenta) > _ultimaDecision(nuevo)) return;
    _aplicarCuenta(nuevo);
}

/** Relee el estado de la cuenta (GET /api/consents): es la verdad, así que se aplica tal cual. */
export async function refrescarConsentimientoIA() {
    const uid = _uidDe(_titularEfectivo());
    if (!uid) return null;
    const decisionAlSalir = _decisiones;
    try {
        const e = await leerPermisoIA();
        // Una decisión tomada mientras el GET viajaba (aceptar, retirar) es más nueva que su respuesta: no se pisa.
        if (decisionAlSalir !== _decisiones) return estadoConsentimientoIA();
        if (e && typeof e.vigente === 'boolean' && _uidDe(_titularEfectivo()) === uid) _aplicarCuenta(_desdeServidor(uid, e));
        return estadoConsentimientoIA();
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────── la hoja
function _avisarHost() {
    if (!_host) return;
    try { _host(_peticion ? { automatica: _peticion.automatica } : null); } catch { /* el host se recupera solo */ }
}

/** El host se suscribe al montarse; si alguien pidió la hoja antes (el host es perezoso), la recibe al instante. */
export function suscribirHojaConsentimientoIA(fn) {
    _host = fn;
    _avisarHost();
    return () => {
        if (_host === fn) _host = null;
    };
}

/** Abre la hoja. Resuelve true si la persona acepta (y quedó anotado) y false con «Ahora no». Una sola a la vez:
 *  quien la pida con otra abierta espera la misma respuesta. */
export function pedirHojaConsentimientoIA({ automatica = false } = {}) {
    if (_peticion) {
        if (!automatica) _peticion.automatica = false;
        return _peticion.promesa;
    }
    let resolver;
    const promesa = new Promise((r) => { resolver = r; });
    _peticion = { promesa, resolver, automatica };
    _avisarHost();
    return promesa;
}

function _cerrarPeticion(valor) {
    const p = _peticion;
    _peticion = null;
    _avisarHost();
    if (p) p.resolver(valor);
}

function _clavePospuesta() {
    return `${AI_CONSENT_VERSION}|${_titularEfectivo() || ''}`;
}

/** «Activa la IA para usar esto»: lo que ve quien dice «Ahora no» a una acción con IA. */
export function avisarActivaLaIA() {
    toast.info(t('Activa la IA para usar esto'), {
        id: 'mf-ia-permiso',
        description: t('Sin tu permiso no enviamos tus datos a la IA. El diario manual, el agua y la Nevera siguen funcionando.'),
        action: { label: t('Activar la IA'), onClick: () => { void pedirHojaConsentimientoIA(); } },
    });
}

/** LA puerta de cada acción con IA. Resuelve true si puede seguir (permiso dado, o aún no se sabe: decide el
 *  servidor) y false si la persona dijo «Ahora no» (ya se le avisó). */
export async function asegurarConsentimientoIA(opciones = {}) {
    if (!faltaPermisoIA()) return true;
    // El perfil puede venir de una caché anterior a la aceptación en otro arranque o dispositivo.
    // Solo se comprueba cuando parece faltar; la cuenta con permiso vigente no paga otra petición.
    if (_uidDe(_titularEfectivo())) {
        const actualizado = await refrescarConsentimientoIA();
        if (actualizado?.vigente === true || !faltaPermisoIA()) return true;
    }
    const ok = await pedirHojaConsentimientoIA(opciones);
    if (!ok) avisarActivaLaIA();
    return ok;
}

/** «Aceptar y continuar». Anota el permiso en el servidor ANTES de dar paso (art. 7.1 del RGPD: tiene que ser
 *  demostrable). Si falla, la hoja sigue abierta con el motivo. `analytics` es el MISMO dato que «Ayuda a mejorar». */
export async function aceptarConsentimientoIA({ analytics = false, textoSha256 = null } = {}) {
    const titular = _titularEfectivo();
    const uid = _uidDe(titular);
    if (titular !== 'invitado' && !uid) return { ok: false, codigo: 'sin_sesion' };
    const sid = titular === 'invitado' ? getGuestSessionId() : null;
    let e = null;
    try {
        e = titular === 'invitado'
            ? await concederPermisoIAInvitado({ sessionId: sid, analytics, textoSha256 })
            : await concederPermisoIA({ analytics, textoSha256 });
    } catch (err) {
        return { ok: false, codigo: (err && err.codigo) || 'red' };
    }
    _decisiones += 1;
    _concedidoEn = Date.now();
    // La casilla de analítica y el interruptor «Ayuda a mejorar» de Configuración son el MISMO dato. Se escribe ANTES
    // de cambiar el estado: quien lo escucha (Configuración) relee la bandera al enterarse.
    try { persistAnalyticsOptOut(analytics !== true); } catch { /* la analítica jamás rompe el permiso */ }
    let planReanudado = false;
    if (titular === 'invitado') {
        _escribirPermisoDeInvitado({ sid, at: new Date().toISOString(), analytics });
    } else {
        planReanudado = !!(e && e.plan_reanudado);
        _aplicarCuenta(e && typeof e.vigente === 'boolean'
            ? _desdeServidor(uid, e)
            : { uid, vigente: true, version: AI_CONSENT_VERSION, at: new Date().toISOString(), revocadoEn: null, analytics });
    }
    safeLocalStorageRemove(CLAVE_POSPUESTA);
    _emitir();
    _cerrarPeticion(true);
    return { ok: true, planReanudado };
}

/** «Ahora no» (o Escape). La hoja ya no sale sola al abrir la app; la siguiente acción con IA vuelve a preguntar. */
export function rechazarConsentimientoIA() {
    safeLocalStorageSet(CLAVE_POSPUESTA, _clavePospuesta());
    _cerrarPeticion(false);
}

/** Configuración → Privacidad → «Retirar mi permiso». Lanza `ErrorDePermisoIA` si el servidor no lo anotó. */
export async function retirarConsentimientoIA() {
    const uid = _uidDe(_titularEfectivo());
    if (!uid) throw new Error('sin_sesion');
    const e = await retirarPermisoIA();
    _decisiones += 1;
    _concedidoEn = 0;
    _aplicarCuenta(e && typeof e.vigente === 'boolean'
        ? _desdeServidor(uid, e)
        : { ...(_cuenta || { uid, version: null, at: null, analytics: null }), uid, vigente: false, revocadoEn: new Date().toISOString() });
    safeLocalStorageSet(CLAVE_POSPUESTA, _clavePospuesta());
    return { planPausado: !!(e && e.plan_pausado) };
}

/** [P1-PLAN-LOTE-847] Configuración → «Ayuda a mejorar». Anota la analítica donde vive el permiso: en la cuenta (el
 *  POST lo hace `guardarAnaliticaEnServidor`, aquí se refleja en memoria) o en el registro del invitado. Devuelve
 *  false si no hay dónde anotarla: un invitado sin registro del permiso la concede desde la hoja. */
export function anotarAnaliticaDelPermiso(valor) {
    const analytics = valor === true;
    const uid = _uidDe(_titularEfectivo());
    if (uid) {
        _cuenta = { ...(_cuenta && _cuenta.uid === uid ? _cuenta : { uid, vigente: null, version: null, at: null, revocadoEn: null }), analytics };
    } else {
        const r = permisoLocalVigente();
        const sid = r && typeof r.quien === 'string' && r.quien.startsWith('invitado:') ? r.quien.slice('invitado:'.length) : null;
        if (!sid) return !analytics;
        _escribirPermisoDeInvitado({ sid, at: r.at, analytics });
    }
    _emitir();
    return true;
}

/** ¿Sale la hoja sola al abrir la app? Solo a una cuenta a la que aún no se le preguntó ESTA versión: ni tras
 *  «Ahora no», ni tras retirarlo (sería insistir), ni con la adopción del plan de un invitado recién entrado en
 *  camino (pasa su permiso a la cuenta con su fecha). */
export function debePreguntarAlAbrirLaApp() {
    const s = _calcular();
    if (s.tipo !== 'cuenta' || s.vigente !== false || s.revocadoEn) return false;
    if (safeLocalStorageGet(CLAVE_POSPUESTA, null) === _clavePospuesta()) return false;
    return !_sidParaAdoptar();
}

// ─────────────────────────────────────────────────────────────── lo que usa fetchWithAuth (import perezoso)
function _marcarSinPermiso() {
    // El servidor acaba de decir que no hay permiso: el del invitado que hubiera en el dispositivo está rancio.
    _decisiones += 1;
    _concedidoEn = 0;
    _olvidarPermisoDeInvitado();
    const uid = _uidDe(_titularEfectivo());
    if (!uid) {
        _emitir();
        return;
    }
    const base = _cuenta && _cuenta.uid === uid ? _cuenta : { uid, version: null, at: null, revocadoEn: null, analytics: null };
    _aplicarCuenta({ ...base, vigente: false });
}

/** Lee el cuerpo UNA vez y devuelve, para el llamador, una respuesta nueva con el mismo estado, cabeceras y cuerpo.
 *  Sin `clone()` a propósito: en Node (undici, donde corren los tests) un clon recogido por el GC puede dejar
 *  inservible el cuerpo del original. En el navegador no pasa, pero así no depende de nadie. */
async function _leerSinGastar(res) {
    if (!res || typeof res.text !== 'function' || typeof Response !== 'function') return { cuerpo: null, respuesta: res };
    let texto;
    try {
        texto = await res.text();
    } catch {
        return { cuerpo: null, respuesta: res };
    }
    let cuerpo = null;
    try { cuerpo = JSON.parse(texto); } catch { /* sin JSON: no es nuestro 428 */ }
    try {
        return { cuerpo, respuesta: new Response(texto, { status: res.status, statusText: res.statusText, headers: res.headers }) };
    } catch {
        return { cuerpo, respuesta: res };
    }
}

/** Un 428 de cualquier endpoint: si es `ai_consent_required`, abre la hoja y, aceptada, repite la petición UNA vez
 *  (`reintentar` no vuelve a pasar por aquí). Con «Ahora no» devuelve el 428 (con su cuerpo intacto): el llamador lo
 *  trata como un error más y el aviso «Activa la IA para usar esto» ya salió.
 *  `salio` (ms) es cuándo salió la petición: si el permiso se dio DESPUÉS, ese 428 es tardío —la petición viajó sin
 *  él— y se repite sin reabrir la hoja ni borrar el permiso recién dado. */
export async function resolverPermisoRequerido(res, reintentar, salio = null) {
    const { cuerpo, respuesta } = await _leerSinGastar(res);
    if (!cuerpo || cuerpo.error_code !== PERMISO_REQUERIDO) return respuesta;
    if (typeof salio === 'number' && _concedidoEn > 0 && _concedidoEn >= salio && !faltaPermisoIA()) return reintentar();
    _marcarSinPermiso();
    if (_uidDe(_titularEfectivo())) {
        const actualizado = await refrescarConsentimientoIA();
        if (actualizado?.vigente === true) return reintentar();
    }
    const ok = await pedirHojaConsentimientoIA();
    if (!ok) {
        avisarActivaLaIA();
        return respuesta;
    }
    return reintentar();
}

/** `POST /api/plans/adopt-guest-plan`: lleva el `session_id` del invitado para que su permiso pase a la cuenta con su
 *  fecha original. Los dos llamadores viven en AssessmentContext (tope de líneas): por eso se añade aquí. El
 *  `session_id` no sale de `mealfit_guest_session_id`, que se borra al entrar la sesión. */
export function conSesionDelPermisoInvitado(options = {}) {
    const sid = _sidParaAdoptar();
    if (!sid || typeof options.body !== 'string') return options;
    try {
        const cuerpo = JSON.parse(options.body);
        if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || cuerpo.session_id) return options;
        return { ...options, body: JSON.stringify({ ...cuerpo, session_id: sid }) };
    } catch {
        return options;
    }
}

/** Tras la adopción (sea cual sea el desenlace): el `session_id` ya cumplió. Si salió bien, el permiso pudo pasar a
 *  la cuenta: se relee (GET /api/consents) para no volver a preguntar lo ya contestado. No se mira el cuerpo: es del
 *  llamador. */
export async function trasAdoptarPlanInvitado(adoptado) {
    safeLocalStorageRemove(CLAVE_ADOPCION);
    _olvidarPermisoDeInvitado();   // la adopción solo la hace una sesión: el invitado ya no existe
    if (adoptado) await refrescarConsentimientoIA();
}

// ─────────────────────────────────────────────────────────────── los ganchos de `fetchWithAuth`
/** Pone la cabecera del invitado en ESTA petición si toca: solo hacia nuestra API y con permiso vigente del invitado
 *  actual (`fetchWithAuth` solo llama con peticiones SIN sesión). */
function _cabeceraParaUrl(url, headers) {
    if (typeof url !== 'string' || (url.startsWith('http') && !(API_BASE && url.startsWith(API_BASE)))) return;
    const c = cabeceraDelInvitado();
    if (c) headers.set(c[0], c[1]);
}

/** Cada petición de `fetchWithAuth`, una vez cargado este módulo: la adopción del plan del invitado lleva su
 *  `session_id`; un 428 abre la hoja y repite UNA vez (`salio` distingue el 428 tardío de una petición que viajó antes
 *  del permiso); la adopción, salga como salga, da por cumplido ese `session_id`. */
async function _enviarConPermiso(url, options, unaVez) {
    const salio = Date.now();
    const adopcion = typeof url === 'string' && url.includes('/adopt-guest-plan');
    const opts = adopcion ? conSesionDelPermisoInvitado(options) : options;
    const res = await unaVez(url, opts);
    if (res && res.status === 428) return resolverPermisoRequerido(res, () => unaVez(url, opts), salio);
    if (adopcion && res) trasAdoptarPlanInvitado(!!res.ok).catch(() => {});
    return res;
}

// Al cargarse, el módulo se engancha a `fetchWithAuth` (config/api.ts no importa nada de `consent/`: techo del
// arranque). Un doble de `config/api` en un test no trae el registro: entonces no hay ganchos, como en el arranque.
try {
    fijarGanchosIA({ cabecera: _cabeceraParaUrl, enviar: _enviarConPermiso });
} catch { /* sin registro: las peticiones salen tal cual */ }

/** Solo tests: vuelve al estado de arranque. */
export function _reiniciarConsentimientoIAParaTests() {
    _titular = null;
    _cuenta = null;
    _instantanea = null;
    _peticion = null;
    _host = null;
    _oyentes.clear();
    _decisiones = 0;
    _concedidoEn = 0;
}
