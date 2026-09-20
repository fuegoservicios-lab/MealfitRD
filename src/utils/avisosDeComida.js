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
import { isNativeApp } from '../config/platform';
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';
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

async function _pluginLocal() {
    try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isPluginAvailable('LocalNotifications')) return null;
        const mod = await import('@capacitor/local-notifications');
        return mod.LocalNotifications || null;
    } catch {
        return null;
    }
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
                title: String(r.title || 'Bioboros'),
                body: String(r.body),
                schedule: { at, allowWhileIdle: true },
                threadIdentifier: 'comidas',
                extra: { url: respuesta.url || RUTA_DEL_AVISO, meal: r.meal || '' },
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
            const LN = await _pluginLocal();
            if (!LN) return { ok: false, code: 'nativa-actualizar' };
            const permiso = await LN.checkPermissions();
            if (permiso?.display !== 'granted') return { ok: false, code: 'permiso' };
            const res = await fetchWithAuth('/api/notifications/meal-reminders');
            if (!res.ok) return { ok: false, code: 'servidor', status: res.status };
            const datos = await res.json();
            await LN.cancel({ notifications: idsPropios().map((id) => ({ id })) });
            const notifications = notificacionesAProgramar(datos);
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
        const LN = await _pluginLocal();
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
        const LN = await _pluginLocal();
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
            const LN = await _pluginLocal();
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
    const LN = await _pluginLocal();
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
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resincronizar(60 * 1000)();
    });
    resincronizar(0)();
}
