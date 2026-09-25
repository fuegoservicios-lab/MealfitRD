// [P1-PLAN-LOTE-133 · 2026-09-20] «Alertas Inteligentes»: UNA fachada para los dos canales.
//
// El dueño: «revisa a profundidad el sistema de notificaciones: quiero que le avise al usuario si no ha desayunado,
// almorzado, merendado… déjalo 100 % listo para producción, y quítale ese beta».
//
// Medido en producción antes de tocar nada: el servidor genera los recordatorios (38 en 5 días, a las 10:30 / 14:30 /
// 17:30 / 21:00) y casi nadie los ve en su pantalla — `push_subscriptions` tenía UNA fila. La app nativa de iOS es un
// WKWebView: no hay Service Worker ni `PushManager`, así que ahí el interruptor no podía funcionar (tocarlo daba «Tu
// navegador no soporta notificaciones Push») y sus avisos solo se veían al abrir el chat.
//
// Dos canales, un interruptor:
//   · 'web-push'  navegador / PWA instalada: la Web Push de siempre (`pushNotifications.js`), la manda el servidor.
//   · 'local'     app nativa: notificaciones LOCALES programadas en el teléfono con `@capacitor/local-notifications`.
//                 El servidor dice a qué hora toca cada comida (`GET /api/notifications/meal-reminders`, la MISMA
//                 cuenta que el cron del chat) y el teléfono las programa para 7 días: salen con la app cerrada, sin
//                 APNs ni red, y la de hoy se cancela en cuanto la comida queda registrada.
// Y tres estados en los que NO se pinta un interruptor muerto, sino qué hacer:
//   · 'ios-instalar'       Safari del iPhone sin instalar: Apple solo da Web Push a la app añadida a la pantalla de inicio.
//   · 'nativa-actualizar'  binario anterior al plugin (el JS llega por OTA; el plugin, solo con un build nuevo).
//   · 'sin-soporte'        navegador sin Push.
import { fetchWithAuth } from '../config/api';
import { isNativeApp, nativePluginAvailable, nativePlatform } from '../config/platform';
import { t } from '../i18n';
import { BRAND } from '../data/routeMeta';
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';
import { safeJSONParse } from './safeJSONParse';
import {
    isPushSupported,
    requestNotificationPermission,
    subscribeToPushNotifications,
    unsubscribeFromPushNotifications,
} from './pushNotifications';

export const CLAVE_AVISOS_LOCALES = 'mealfit_avisos_locales';
export const CLAVE_PUSH_WEB = 'mealfit_push_enabled';
export const DIAS_PROGRAMADOS = 7;
// ids propios y deterministas: día 0..6 × comida 0..9 → 4100..4169. Cancelar «los nuestros» no toca nada más.
export const ID_BASE = 4100;
const RUTA_DEL_AVISO = '/dashboard/agent';
// [P1-PLAN-LOTE-135 · 2026-09-20] Avisos de HIDRATACIÓN (backend/hydration_reminders.py): tres puntos de control al
// día, en su propio rango de ids. Solo se programan HOY + 2 días: si el usuario no vuelve a abrir la app, a las 48 h
// el servidor apaga la hidratación y el teléfono ya no tiene nada más programado — no hay aviso huérfano.
export const ID_BASE_AGUA = 4200;
// [P1-PLAN-LOTE-137 · 2026-09-20] El dueño, con el primer aviso real en la pantalla de bloqueo: «salió fuera de la app y
// eso está bien, pero no hizo ningún sonido, y WhatsApp sí suena». El plugin en iOS SOLO pone `content.sound` si el
// aviso trae `sound` no vacío (`LocalNotificationsPlugin.swift`: `if let sound …, !sound.isEmpty`); sin él queda en nil
// y iOS lo entrega MUDO aunque el permiso incluya sonido. No empaquetamos ningún audio: un nombre que no existe en el
// bundle hace que iOS toque el sonido de notificación POR DEFECTO del sistema, que es justo lo que se quiere.
export const SONIDO_DEL_AVISO = 'default';
// [P1-PLAN-LOTE-137] Lo que ya se programó para HOY, por comida (`{ fecha, comidas: { almuerzo: <ms> } }`).
const CLAVE_PROGRAMADO_HOY = 'mealfit_avisos_programados_hoy';

const _fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Un recordatorio por comida y DÍA. La hora del aviso es adaptativa (la recalcula el servidor en cada
 * sincronización) y se mueve: al dueño le sonó «¿Ya almorzaste?» a las 14:35 y, tras abrir la app, el almuerzo se
 * reprogramó para las 15:35 — la misma pregunta dos veces en una hora. Pura: recibe lo que se iba a programar, el
 * libro de lo ya programado hoy y «ahora»; devuelve `{ notificaciones, libro }`. Una comida cuyo aviso de hoy YA
 * sonó (su hora programada pasó) no se vuelve a programar hoy; los demás días y el agua no se tocan.
 */
export function sinRepetirLoDeHoy(notificaciones, libro, ahora = new Date()) {
    const hoy = _fechaLocal(ahora);
    const previas = libro && libro.fecha === hoy && libro.comidas && typeof libro.comidas === 'object' ? libro.comidas : {};
    const comidas = {};
    for (const [meal, at] of Object.entries(previas)) {
        if (Number(at) <= ahora.getTime()) comidas[meal] = Number(at);      // ya sonó hoy: se recuerda
    }
    const out = [];
    for (const n of notificaciones || []) {
        const meal = n?.extra?.meal;
        const at = n?.schedule?.at instanceof Date ? n.schedule.at : null;
        if (meal && at && _fechaLocal(at) === hoy) {
            if (comidas[meal] !== undefined && comidas[meal] <= ahora.getTime()) continue;   // hoy ya se preguntó
            comidas[meal] = at.getTime();
        }
        out.push(n);
    }
    return { notificaciones: out, libro: { fecha: hoy, comidas } };
}
export const DIAS_DE_AGUA = 3;
const RUTA_DEL_AGUA = '/dashboard';
const EVENTO_AGUA_CAMBIO = 'mealfit:water-changed';

/** El valor con el que NACE el interruptor (síncrono, sin parpadeo off→on): lo último confirmado en este dispositivo. */
export function interruptorAlNacer() {
    try {
        if (isNativeApp()) return safeLocalStorageGet(CLAVE_AVISOS_LOCALES, null) === '1';
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
        return safeLocalStorageGet(CLAVE_PUSH_WEB, null) === 'true';
    } catch { return false; }
}

/** ¿El permiso lo da el NAVEGADOR (y por tanto se puede vigilar con `navigator.permissions`)? En la app nativa, no. */
export function elPermisoEsDelNavegador() {
    return !isNativeApp();
}

/** El canal que le toca a este dispositivo. Pura: todo lo que mira entra por parámetro (la prueba lo agradece). */
export function canalDeAvisos({ esNativa, pluginLocal, pushSoportado, esIOS, esInstalada } = {}) {
    if (esNativa) return pluginLocal ? 'local' : 'nativa-actualizar';
    if (pushSoportado) return 'web-push';
    if (esIOS && !esInstalada) return 'ios-instalar';
    return 'sin-soporte';
}

function _esIOS() {
    try {
        const ua = navigator.userAgent || '';
        return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    } catch { return false; }
}

function _esInstalada() {
    try {
        return window.matchMedia?.('(display-mode: standalone)')?.matches === true || window.navigator.standalone === true;
    } catch { return false; }
}

// [P1-PLAN-LOTE-135 · 2026-09-20] EL PLUGIN VIAJA DENTRO DE UNA CAJA `{ LN }`, NUNCA SUELTO. El dueño, ya con el
// binario que trae el plugin: «es que ni se inmuta, no se puede encender». Una función `async` que DEVUELVE un valor
// le pregunta si es una promesa (lee `.then`), y el plugin de Capacitor es un Proxy que responde a CUALQUIER propiedad
// con una función que llama al lado nativo: `.then(resolve, reject)` se volvía una llamada nativa «then» que no
// existe y que jamás invoca a `resolve`. La promesa no se resolvía NUNCA: el canal se quedaba en `null` y el
// interruptor, deshabilitado para siempre. Pasa igual con `await plugin` y con `resolve(plugin)`. No lo «simplifiques»
// devolviendo el plugin: `lote135.proxy.test.js` lo prueba con un doble fiel al Proxy real.
async function _pluginLocal() {
    try {
        if (!nativePluginAvailable('LocalNotifications')) return null;
        const mod = await import('@capacitor/local-notifications');
        return mod.LocalNotifications ? { LN: mod.LocalNotifications } : null;
    } catch {
        return null;
    }
}

// [P1-PLAN-LOTE-162 · 2026-09-22] ALARMAS EXACTAS EN ANDROID. El plugin programa por defecto con alarma EXACTA
// (`isExactNotification: true`) y, si Android no la permite, abre él solo la pantalla del sistema «Alarmas y
// recordatorios» EN CADA `schedule()`. Desde Android 14 ese permiso nace DENEGADO para las apps nuevas, y esta app
// reprograma al abrir, al volver, tras cada comida anotada y tras cada respuesta del coach: el tester que encendía
// los avisos acababa sacado a Ajustes una y otra vez, sin una palabra de por qué. Ahora se programa EXACTA solo si el
// permiso ya está dado; si no, inexacta (llega con algo de margen) y SIN abrir nada. El permiso se pide una vez, a
// propósito y con explicación, desde Configuración (`pedirAlarmaExacta`).
//
// Tres respuestas: `true` concedido, `false` Android dice que no, `null` no se sabe (iOS no implementa el método —ahí
// el campo no existe y se ignora— o no contestó a tiempo). Solo `true` pide exactitud: la duda nunca abre Ajustes.
const _TOPE_CONSULTA_ALARMA_MS = 500;

async function _alarmaExactaConcedida(LN) {
    try {
        const r = await Promise.race([
            LN.checkExactNotificationSetting(),
            new Promise((resolve) => setTimeout(() => resolve(null), _TOPE_CONSULTA_ALARMA_MS)),
        ]);
        if (!r || typeof r !== 'object') return null;
        if (r.exact_alarm === 'granted') return true;
        if (r.exact_alarm === 'denied') return false;
        return null;
    } catch {
        return null;
    }
}

// [P1-PLAN-LOTE-166 · 2026-09-22] Android: los avisos iban al canal «Default» del plugin —nombre fijo en inglés en los
// ajustes del sistema e importancia NORMAL: suena, pero no asoma arriba de la pantalla—. Canal propio, con el nombre en
// el idioma del usuario e importancia ALTA (aviso emergente). Android no deja subir la importancia de un canal que ya
// existe —por eso es un canal NUEVO y no un retoque del viejo—; el nombre sí se actualiza al volver a crearlo, así que
// sigue al idioma. Si el canal no se pudo crear, el aviso sale por el de siempre: mandar un `channelId` que no existe
// lo haría DESAPARECER sin error. (iOS no tiene canales: ahí no se intenta.)
export const CANAL_ANDROID = 'bioboros-avisos';
const _TOPE_CANAL_MS = 1500;

async function _canalAndroid(LN) {
    try {
        if (nativePlatform() !== 'android') return null;
        await Promise.race([
            LN.createChannel({
                id: CANAL_ANDROID,
                name: t('Recordatorios'),
                description: t('Tus comidas y el agua, a su hora.'),
                importance: 4,
                visibility: 1,
                vibration: true,
            }),
            new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('sin respuesta')), _TOPE_CANAL_MS)),
        ]);
        return CANAL_ANDROID;
    } catch {
        return null;
    }
}

/** [P1-PLAN-LOTE-162] ¿Android está programando los avisos sin hora exacta por falta de permiso? */
export async function alarmaExactaPendiente() {
    if (!isNativeApp()) return false;
    const LN = (await _pluginLocal())?.LN;
    if (!LN) return false;
    return (await _alarmaExactaConcedida(LN)) === false;
}

/** [P1-PLAN-LOTE-162] Lo pide la PERSONA desde Configuración: abre «Alarmas y recordatorios» y reprograma al volver. */
export async function pedirAlarmaExacta() {
    const LN = (await _pluginLocal())?.LN;
    if (!LN) return false;
    try { await LN.changeExactNotificationSetting(); } catch { /* volvió sin cambiar nada */ }
    await sincronizarAvisosLocales();
    return !(await alarmaExactaPendiente());
}

export async function canalDeEsteDispositivo() {
    const esNativa = isNativeApp();
    return canalDeAvisos({
        esNativa,
        pluginLocal: esNativa ? !!(await _pluginLocal()) : false,
        pushSoportado: !esNativa && isPushSupported(),
        esIOS: _esIOS(),
        esInstalada: _esInstalada(),
    });
}

/** Los ids que ESTE módulo programa (para cancelarlos sin tocar ninguna otra notificación de la app). */
export function idsPropios() {
    const ids = [];
    for (let d = 0; d < DIAS_PROGRAMADOS; d += 1) for (let m = 0; m < 10; m += 1) ids.push(ID_BASE + d * 10 + m);
    // [135] los del agua se cancelan SIEMPRE por los 7 días, aunque hoy solo se programen 3: si el rango encoge en un
    // despliegue, los ya programados con el rango viejo no quedan huérfanos.
    for (let d = 0; d < DIAS_PROGRAMADOS; d += 1) for (let m = 0; m < 10; m += 1) ids.push(ID_BASE_AGUA + d * 10 + m);
    return ids;
}

/**
 * Qué se programa. Pura: recibe la respuesta del servidor y «ahora», devuelve las notificaciones.
 *   · lo de HOY ya registrado no se programa (es justo lo que el aviso preguntaría);
 *   · lo que ya pasó (o toca en menos de un minuto) tampoco;
 *   · los demás días se programan todos: el teléfono no sabe si mañana desayunarás — al abrir la app se vuelve a
 *     sincronizar y lo registrado se cancela.
 */
export function notificacionesAProgramar(respuesta, ahora = new Date()) {
    if (!respuesta || respuesta.enabled === false || !Array.isArray(respuesta.reminders)) return [];
    const out = [];
    for (let d = 0; d < DIAS_PROGRAMADOS; d += 1) {
        respuesta.reminders.slice(0, 10).forEach((r, m) => {
            const hora = Number(r?.hour);
            const minuto = Number(r?.minute ?? 0);
            if (!Number.isFinite(hora) || hora < 0 || hora > 23 || !Number.isFinite(minuto) || !r?.body) return;
            if (d === 0 && r.logged_today) return;
            const at = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + d, hora, minuto, 0, 0);
            if (at.getTime() <= ahora.getTime() + 60 * 1000) return;
            out.push({
                id: ID_BASE + d * 10 + m,
                title: String(r.title || BRAND),
                body: String(r.body),
                schedule: { at, allowWhileIdle: true },
                sound: SONIDO_DEL_AVISO,
                threadIdentifier: 'comidas',
                extra: { url: respuesta.url || RUTA_DEL_AVISO, meal: r.meal || '' },
            });
        });
    }
    return out;
}

/**
 * Los avisos de hidratación a programar. Pura. `respuesta.water` viene del mismo GET que las comidas.
 *   · HOY: solo los puntos de control en los que el usuario NO va al día (`met_today`), con su cuenta real;
 *   · los días siguientes: todos, con el texto genérico (nadie sabe cuántos vasos llevará mañana).
 */
export function avisosDeAguaAProgramar(respuesta, ahora = new Date()) {
    const agua = respuesta?.water;
    if (!agua || agua.enabled !== true || !Array.isArray(agua.reminders)) return [];
    const dias = Math.max(1, Math.min(DIAS_PROGRAMADOS, Number(agua.days) || DIAS_DE_AGUA));
    const out = [];
    for (let d = 0; d < dias; d += 1) {
        agua.reminders.slice(0, 10).forEach((r, m) => {
            const hora = Number(r?.hour);
            const minuto = Number(r?.minute ?? 0);
            const cuerpo = d === 0 ? r?.body : (r?.body_generic || r?.body);
            if (!Number.isFinite(hora) || hora < 0 || hora > 23 || !Number.isFinite(minuto) || !cuerpo) return;
            if (d === 0 && r.met_today) return;
            const at = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + d, hora, minuto, 0, 0);
            if (at.getTime() <= ahora.getTime() + 60 * 1000) return;
            out.push({
                id: ID_BASE_AGUA + d * 10 + m,
                title: String(r.title || BRAND),
                body: String(cuerpo),
                schedule: { at, allowWhileIdle: true },
                sound: SONIDO_DEL_AVISO,
                threadIdentifier: 'agua',
                extra: { url: agua.url || RUTA_DEL_AGUA, kind: 'water' },
            });
        });
    }
    return out;
}

let _sincronizando = null;

/** Reprograma los avisos locales contra lo que dice el servidor. No hace nada si el interruptor está apagado. */
export async function sincronizarAvisosLocales() {
    if (!isNativeApp() || safeLocalStorageGet(CLAVE_AVISOS_LOCALES, null) !== '1') return { ok: false, code: 'apagado' };
    if (_sincronizando) return _sincronizando;
    _sincronizando = (async () => {
        try {
            const LN = (await _pluginLocal())?.LN;
            if (!LN) return { ok: false, code: 'nativa-actualizar' };
            const permiso = await LN.checkPermissions();
            if (permiso?.display !== 'granted') return { ok: false, code: 'permiso' };
            // `canal=local`: el servidor anota que a este usuario los avisos SÍ le llegan (sin eso no le cuenta los
            // de agua como «ignorados» ni le apaga la hidratación a las 48 h).
            const res = await fetchWithAuth('/api/notifications/meal-reminders?canal=local');
            if (!res.ok) return { ok: false, code: 'servidor', status: res.status };
            const datos = await res.json();
            await LN.cancel({ notifications: idsPropios().map((id) => ({ id })) });
            // [137] una pregunta por comida y día (ver `sinRepetirLoDeHoy`)
            const _deComida = sinRepetirLoDeHoy(
                notificacionesAProgramar(datos),
                safeJSONParse(safeLocalStorageGet(CLAVE_PROGRAMADO_HOY, null), null),
            );
            safeLocalStorageSet(CLAVE_PROGRAMADO_HOY, JSON.stringify(_deComida.libro));
            // [P1-PLAN-LOTE-162] exacta SOLO con el permiso ya dado: con él pendiente, el plugin abriría Ajustes.
            const exacta = (await _alarmaExactaConcedida(LN)) === true;
            const canal = await _canalAndroid(LN);   // [P1-PLAN-LOTE-166] null ⇒ el canal de siempre
            const notifications = [..._deComida.notificaciones, ...avisosDeAguaAProgramar(datos)]
                .map((n) => ({ ...n, isExactNotification: exacta, ...(canal ? { channelId: CANAL_ANDROID } : {}) }));
            if (notifications.length) await LN.schedule({ notifications });
            return { ok: true, programadas: notifications.length, motivo: datos?.reason || null };
        } catch (e) {
            return { ok: false, code: 'error', error: e?.message || String(e) };
        } finally {
            _sincronizando = null;
        }
    })();
    return _sincronizando;
}

/** ¿Está encendido AHORA, en este dispositivo? `{ canal, activo, bloqueado }`. */
export async function estadoDeAvisos() {
    const canal = await canalDeEsteDispositivo();
    if (canal === 'local') {
        const LN = (await _pluginLocal())?.LN;
        let permiso = 'prompt';
        try { permiso = (await LN.checkPermissions())?.display || 'prompt'; } catch { /* sin permiso legible */ }
        const quiere = safeLocalStorageGet(CLAVE_AVISOS_LOCALES, null) === '1';
        return { canal, activo: quiere && permiso === 'granted', bloqueado: permiso === 'denied' };
    }
    if (canal === 'web-push') {
        if (typeof Notification === 'undefined') return { canal, activo: false, bloqueado: false };
        if (Notification.permission === 'denied') return { canal, activo: false, bloqueado: true };
        if (Notification.permission !== 'granted') return { canal, activo: false, bloqueado: false };
        try {
            let reg = await navigator.serviceWorker.getRegistration();
            if (!reg) {
                reg = await Promise.race([
                    navigator.serviceWorker.ready,
                    new Promise((_, rej) => setTimeout(() => rej(new Error('SW timeout')), 2000)),
                ]);
            }
            const sub = reg ? await reg.pushManager.getSubscription() : null;
            return { canal, activo: !!sub, bloqueado: false };
        } catch {
            return { canal, activo: false, bloqueado: false };
        }
    }
    return { canal, activo: false, bloqueado: false };
}

/** Enciende los avisos en este dispositivo. `{ ok, canal, code?, status?, error? }` — códigos, nunca copy. */
export async function activarAvisos() {
    const canal = await canalDeEsteDispositivo();
    if (canal === 'local') {
        const LN = (await _pluginLocal())?.LN;
        let permiso = (await LN.checkPermissions())?.display;
        if (permiso !== 'granted') permiso = (await LN.requestPermissions())?.display;
        if (permiso !== 'granted') return { ok: false, canal, code: 'permiso_denegado' };
        safeLocalStorageSet(CLAVE_AVISOS_LOCALES, '1');
        const r = await sincronizarAvisosLocales();
        if (!r.ok) {
            safeLocalStorageSet(CLAVE_AVISOS_LOCALES, '0');
            return { ok: false, canal, code: r.code === 'servidor' ? 'server_error' : 'local_error', status: r.status, error: r.error };
        }
        return { ok: true, canal, programadas: r.programadas, motivo: r.motivo };
    }
    if (canal === 'web-push') {
        const concedido = await requestNotificationPermission();
        if (!concedido) return { ok: false, canal, code: 'permiso_denegado' };
        const r = await subscribeToPushNotifications();
        if (r?.success) {
            safeLocalStorageSet(CLAVE_PUSH_WEB, 'true');
            return { ok: true, canal };
        }
        return { ok: false, canal, code: r?.code || 'desconocido', status: r?.status, error: r?.error };
    }
    return { ok: false, canal, code: canal };
}

/** Apaga los avisos en este dispositivo. */
export async function desactivarAvisos() {
    const canal = await canalDeEsteDispositivo();
    if (canal === 'local') {
        safeLocalStorageSet(CLAVE_AVISOS_LOCALES, '0');
        try {
            const LN = (await _pluginLocal())?.LN;
            await LN.cancel({ notifications: idsPropios().map((id) => ({ id })) });
        } catch { /* nada que cancelar */ }
        return { ok: true, canal };
    }
    if (canal === 'web-push') {
        const ok = await unsubscribeFromPushNotifications();
        if (ok) safeLocalStorageSet(CLAVE_PUSH_WEB, 'false');
        return { ok: !!ok, canal };
    }
    return { ok: true, canal };
}

/**
 * Al CERRAR SESIÓN, antes de soltar el token: este dispositivo deja de recibir los avisos de ESTA cuenta. Sin esto la
 * fila de `push_subscriptions` seguía apuntando al navegador y los recordatorios del usuario A le llegaban al B que
 * entrara después; y en el teléfono, los avisos locales de A seguían sonando. Best-effort: jamás bloquea el logout.
 */
export async function apagarAvisosAlCerrarSesion() {
    try {
        if (isNativeApp()) {
            if (safeLocalStorageGet(CLAVE_AVISOS_LOCALES, null) === '1') await desactivarAvisos();
        } else if (isPushSupported() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            await Promise.race([
                unsubscribeFromPushNotifications(),
                new Promise((resolve) => setTimeout(resolve, 2500)),
            ]);
        }
    } catch { /* el logout sigue */ }
    safeLocalStorageSet(CLAVE_PUSH_WEB, 'false');
    safeLocalStorageSet(CLAVE_AVISOS_LOCALES, '0');
}

let _iniciado = false;

/**
 * En la app nativa, una vez por arranque: tocar el aviso abre el chat, y los avisos se vuelven a sincronizar al
 * registrar una comida (`mealfit:diary-changed`) y al volver a la app. En web no hace nada.
 */
export async function iniciarAvisosLocales() {
    if (_iniciado || !isNativeApp()) return;
    _iniciado = true;
    const LN = (await _pluginLocal())?.LN;
    if (!LN) return;
    try {
        await LN.addListener('localNotificationActionPerformed', (ev) => {
            const url = ev?.notification?.extra?.url || RUTA_DEL_AVISO;
            try {
                if (window.location.pathname !== url) {
                    window.history.pushState({}, '', url);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                }
            } catch {
                window.location.assign(url);
            }
        });
    } catch { /* sin listener: el aviso abre la app donde estuviera */ }
    let ultimo = 0;
    const resincronizar = (minimoMs) => () => {
        const t = Date.now();
        if (t - ultimo < minimoMs) return;
        ultimo = t;
        sincronizarAvisosLocales();
    };
    window.addEventListener('mealfit:diary-changed', resincronizar(1500));
    // [135] Anotar agua cambia qué avisos tocan hoy. Por el FINAL de la ráfaga, no por el principio: quien toca «+» tres
    // veces seguidas debe quedar sincronizado con 3 vasos, no con el primero (el freno de arriba descartaría los otros).
    let aguaTimer = null;
    window.addEventListener(EVENTO_AGUA_CAMBIO, () => {
        if (aguaTimer) clearTimeout(aguaTimer);
        aguaTimer = setTimeout(() => { aguaTimer = null; ultimo = Date.now(); sincronizarAvisosLocales(); }, 4000);
    });
    // [P1-PLAN-LOTE-137 · 2026-09-20] El dueño: «me llegó la notificación del almuerzo y ya había almorzado». Medido
    // (nginx + diario): la app sincronizó a las 15:20:15 —almuerzo aún sin anotar ⇒ aviso programado para las 15:35—,
    // el almuerzo se anotó POR EL CHAT a las 15:21:32, y nadie volvió a sincronizar: `mealfit:diary-changed` solo lo
    // emiten las tarjetas del diario, no el chat, que es justo por donde el aviso pide que se anote. Se escucha el
    // fin de cada turno del chat (no depende de que el modelo emita su tag) y los dos eventos que el chat ya lanza
    // al mutar diario/agua. Por el FINAL de la ráfaga: la escritura de la tool ya está en la base cuando corre.
    let chatTimer = null;
    const trasElChat = () => {
        if (chatTimer) clearTimeout(chatTimer);
        chatTimer = setTimeout(() => { chatTimer = null; ultimo = Date.now(); sincronizarAvisosLocales(); }, 2500);
    };
    for (const ev of ['mealfit:chat-turn-done', 'mealfit:refresh-inventory', 'mealfit:refresh-hydration']) {
        window.addEventListener(ev, trasElChat);
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resincronizar(60 * 1000)();
    });
    resincronizar(0)();
}

// [P1-PLAN-LOTE-228 · 2026-09-25] Avisos locales SUELTOS (hoy: «Tu plan está listo», `utils/avisoPlanListo.js`), con
// el mismo plugin, canal Android, sonido y regla de alarma exacta que las comidas. No dependen del interruptor de los
// recordatorios: es la respuesta a algo que el usuario acaba de pedir. Sus ids viven FUERA de `idsPropios()` (4300+),
// así que la resincronización de comidas/agua no los cancela.

/** Permiso de notificaciones locales: 'granted' | 'denied' | 'prompt' | null (no nativa o sin plugin). */
export async function permisoAvisosLocales({ pedir = false } = {}) {
    if (!isNativeApp()) return null;
    const LN = (await _pluginLocal())?.LN;
    if (!LN) return null;
    try {
        let r = await LN.checkPermissions();
        if (pedir && r?.display && r.display !== 'granted' && r.display !== 'denied') r = await LN.requestPermissions();
        const d = r?.display;
        if (d === 'granted' || d === 'denied') return d;
        return d ? 'prompt' : null;
    } catch {
        return null;
    }
}

/** Programa UN aviso local (`{ id, title, body, at, url, kind }`). true si quedó programado. Nunca lanza. */
export async function programarAvisoLocal({ id, title, body, at, url = '/dashboard', kind = '' } = {}) {
    if (!isNativeApp() || !Number.isInteger(id) || !(at instanceof Date)) return false;
    const LN = (await _pluginLocal())?.LN;
    if (!LN) return false;
    try {
        if ((await permisoAvisosLocales()) !== 'granted') return false;
        const exacta = (await _alarmaExactaConcedida(LN)) === true;
        const canal = await _canalAndroid(LN);
        await LN.schedule({
            notifications: [{
                id,
                title: String(title || BRAND),
                body: String(body || ''),
                schedule: { at, allowWhileIdle: true },
                sound: SONIDO_DEL_AVISO,
                extra: { url, kind },
                isExactNotification: exacta,
                ...(canal ? { channelId: CANAL_ANDROID } : {}),
            }],
        });
        return true;
    } catch {
        return false;
    }
}

/** Cancela avisos locales por id. Nunca lanza. */
export async function cancelarAvisosLocales(ids) {
    if (!isNativeApp() || !Array.isArray(ids) || !ids.length) return;
    const LN = (await _pluginLocal())?.LN;
    if (!LN) return;
    try { await LN.cancel({ notifications: ids.map((id) => ({ id })) }); } catch { /* nada que cancelar */ }
}
