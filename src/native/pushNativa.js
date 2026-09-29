// [P1-PLAN-LOTE-280 · 2026-09-25] Push NATIVA con Firebase Cloud Messaging (Android).
//
// Hasta hoy la app nativa solo tenía avisos LOCALES (los programa el teléfono: comidas, agua): lo que decide el
// SERVIDOR —el plan listo, el coach proactivo, la Nevera, las pausas del plan— solo llegaba a la web/PWA por Web Push.
// Con FCM el servidor le escribe al teléfono aunque la app esté cerrada (`backend/fcm_push.py`).
//
//   · Registro: con el permiso de notificaciones YA concedido (lo pide el interruptor de avisos o empezar a generar un
//     plan; aquí nunca se interrumpe al usuario con un diálogo al arrancar). El token va a
//     `POST /api/notifications/device-token`, y se reenvía si cambia la cuenta o pasó un día (el servidor hace UPSERT).
//   · Con la app DELANTE, Android no pinta la push: si trae `solo_si_no_mira` (el plan listo: ya lo ve en pantalla) se
//     ignora; si no, se muestra como aviso local para que no se pierda.
//   · Tocar el aviso abre la ruta que trae (`data.url`).
//   · Cerrar sesión borra el token de ESTA cuenta (antes del signOut, que el DELETE va autenticado).
//   · [P1-PLAN-LOTE-718] Apagar «Alertas Inteligentes» también: `apagarPushNativa` borra el token en el servidor
//     y deja una marca para que volver a la app no lo registre otra vez; `permitirPushNativa` la quita.
// Sin el plugin (binario anterior) todo es no-op: el JS llega por OTA, el plugin solo con un APK nuevo.
import { isNativeApp, nativePluginAvailable, nativePlatform } from '../config/platform';
import { fetchWithAuth } from '../config/api';
import { t } from '../i18n';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/safeLocalStorage';

export const CLAVE_TOKEN = 'mealfit_fcm_token';
export const CLAVE_ENVIADO = 'mealfit_fcm_enviado';   // `{ user, at }` del último registro aceptado por el servidor
// [P1-PLAN-LOTE-718 · 2026-09-28] `{ user, pendiente }`: esta cuenta apagó las alertas en este teléfono. `pendiente` =
// el DELETE del token aún no llegó al servidor (sin red al apagar) y se reintenta al volver a la app.
export const CLAVE_APAGADA = 'mealfit_fcm_apagada';
export const CANAL_ANDROID = 'bioboros-avisos';        // el mismo canal que los recordatorios (utils/avisosDeComida)
export const REENVIO_MS = 24 * 60 * 60 * 1000;
const ID_AVISO_EN_PRIMER_PLANO = 4400;
const TOPE_BORRADO_MS = 2500;

const _usuarioActual = () => safeLocalStorageGet('mealfit_user_id', null) || null;

function _leerJSON(clave) {
    try { return JSON.parse(safeLocalStorageGet(clave, 'null') || 'null'); } catch { return null; }
}

/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] ¿La cuenta actual apagó la push nativa en este teléfono?
 *
 * EL DEFECTO: apagar «Alertas Inteligentes» en la app nativa solo cancelaba los recordatorios LOCALES. El token de
 * FCM/APNs seguía en el servidor —el plan listo, el coach, la Nevera seguían llegando— y, peor, `registrarSiHayPermiso`
 * volvía a registrarlo en cada regreso a la app: aunque alguien lo borrara, el teléfono lo reponía solo.
 *
 * Es por cuenta: la marca de A no apaga nada a B si entra en el mismo teléfono. Sin usuario conocido, se respeta.
 */
export function pushNativaApagada() {
    const marca = _leerJSON(CLAVE_APAGADA);
    if (!marca) return false;
    const usuario = _usuarioActual();
    return !marca.user || !usuario || marca.user === usuario;
}

async function _borrarTokenEnServidor(token) {
    try {
        const r = await Promise.race([
            fetchWithAuth('/api/notifications/device-token', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, platform: nativePlatform() === 'ios' ? 'ios' : 'android' }),
            }),
            new Promise((resolve) => setTimeout(() => resolve(null), TOPE_BORRADO_MS)),
        ]);
        return !!(r && r.ok);
    } catch {
        return false;
    }
}

/** ¿Hay que (re)enviar el token? Pura: token, usuario actual, lo último enviado y «ahora». */
export function hayQueEnviar({ token, usuario, enviado, ahora = Date.now() }) {
    if (!token || !usuario) return false;
    if (!enviado || enviado.user !== usuario || enviado.token !== token) return true;
    return !(Number(enviado.at) > 0) || ahora - Number(enviado.at) > REENVIO_MS;
}

/** ¿El servidor ya tiene el token de este teléfono para la cuenta actual? (el vigía del plan lo consulta) */
export function pushNativaActiva() {
    // [P1-PLAN-LOTE-718] Apagada = el vigía local del plan listo vuelve a ser quien avisa.
    if (pushNativaApagada()) return false;
    try {
        const enviado = JSON.parse(safeLocalStorageGet(CLAVE_ENVIADO, 'null') || 'null');
        return !!(enviado && enviado.user && enviado.user === _usuarioActual());
    } catch {
        return false;
    }
}

async function _plugin() {
    try {
        if (!isNativeApp() || !nativePluginAvailable('PushNotifications')) return null;
        const mod = await import('@capacitor/push-notifications');
        // En una caja, nunca suelto: el plugin es un Proxy y `await plugin` llamaría a un «then» nativo (lote 135).
        return mod.PushNotifications ? { PN: mod.PushNotifications } : null;
    } catch {
        return null;
    }
}

export async function enviarToken() {
    // [P1-PLAN-LOTE-718] Con las alertas apagadas no se registra nada: ni al arrancar, ni al volver, ni cada 5 min.
    if (pushNativaApagada()) return false;
    const token = safeLocalStorageGet(CLAVE_TOKEN, null);
    const usuario = _usuarioActual();
    let enviado = null;
    try { enviado = JSON.parse(safeLocalStorageGet(CLAVE_ENVIADO, 'null') || 'null'); } catch { enviado = null; }
    if (!hayQueEnviar({ token, usuario, enviado })) return false;
    try {
        const r = await fetchWithAuth('/api/notifications/device-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, platform: nativePlatform() === 'ios' ? 'ios' : 'android' }),
        });
        if (!r || !r.ok) return false;
        safeLocalStorageSet(CLAVE_ENVIADO, JSON.stringify({ user: usuario, token, at: Date.now() }));
        return true;
    } catch {
        return false;
    }
}

/** Pide a FCM el token si el permiso ya está concedido (sin diálogo). */
export async function registrarSiHayPermiso() {
    // [P1-PLAN-LOTE-718] Mientras la cuenta tenga las alertas apagadas, volver a la app NO vuelve a registrarse.
    if (pushNativaApagada()) return false;
    const PN = (await _plugin())?.PN;
    if (!PN) return false;
    try {
        const p = await PN.checkPermissions();
        if (p?.receive !== 'granted') return false;
        await PN.register();
        return true;
    } catch {
        return false;
    }
}

/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] Apaga la push NATIVA de la cuenta actual en este teléfono: marca «apagada» (así
 * `registrarSiHayPermiso`/`enviarToken` dejan de reponer el token al volver a la app) y borra el token en el servidor
 * (`DELETE /api/notifications/device-token`, el mismo que usa el cierre de sesión). Acotado a 2,5 s; si el borrado
 * no llega, la marca lo deja pendiente y se reintenta al volver a la app. Nunca lanza.
 * @returns {Promise<boolean>} true si el servidor confirmó el borrado (o no había nada que borrar).
 */
export async function apagarPushNativa() {
    const usuario = _usuarioActual();
    const token = safeLocalStorageGet(CLAVE_TOKEN, null);
    safeLocalStorageRemove(CLAVE_ENVIADO);
    const hayQueBorrar = !!(token && isNativeApp());
    safeLocalStorageSet(CLAVE_APAGADA, JSON.stringify({ user: usuario, pendiente: hayQueBorrar }));
    if (!hayQueBorrar) return true;
    const ok = await _borrarTokenEnServidor(token);
    if (ok) safeLocalStorageSet(CLAVE_APAGADA, JSON.stringify({ user: usuario, pendiente: false }));
    return ok;
}

/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] Lo contrario: quita la marca y, con el permiso ya concedido, registra el token y se
 * lo manda al servidor. No pide permiso (eso lo hace quien enciende). Nunca lanza.
 * @returns {Promise<boolean>} true si el token quedó enviado.
 */
export async function permitirPushNativa() {
    safeLocalStorageRemove(CLAVE_APAGADA);
    try {
        await registrarSiHayPermiso();
        return await enviarToken();
    } catch {
        return false;
    }
}

/** Un borrado que quedó pendiente al apagar (sin red), reintentado con la sesión que haya ahora. */
async function _reintentarBorradoPendiente() {
    const marca = _leerJSON(CLAVE_APAGADA);
    const token = safeLocalStorageGet(CLAVE_TOKEN, null);
    if (!marca || !marca.pendiente || !token || !pushNativaApagada()) return;
    if (await _borrarTokenEnServidor(token)) {
        safeLocalStorageSet(CLAVE_APAGADA, JSON.stringify({ user: marca.user || null, pendiente: false }));
    }
}

/** Al cerrar sesión: el servidor deja de mandar a este teléfono los avisos de esta cuenta. Acotado a 2,5 s. */
export async function olvidarTokenAlCerrarSesion() {
    const token = safeLocalStorageGet(CLAVE_TOKEN, null);
    // [P1-PLAN-LOTE-718 · 2026-09-28] Solo se borra lo que este teléfono registró para la cuenta (o un borrado que
    // quedó pendiente al apagar las alertas). Tras BORRAR LA CUENTA, `DeleteAccountSection` ya hizo esta limpieza con
    // la sesión viva; un segundo DELETE aquí, ya sin cuenta, respondía 401 y hacía saltar «Tu sesión expiró» encima de
    // «Tu cuenta fue eliminada».
    const habiaEnvio = !!safeLocalStorageGet(CLAVE_ENVIADO, null);
    const marca = _leerJSON(CLAVE_APAGADA);
    const pendiente = !!(marca && marca.pendiente);
    safeLocalStorageRemove(CLAVE_ENVIADO);
    if (!token || !isNativeApp() || !(habiaEnvio || pendiente)) return;
    const ok = await _borrarTokenEnServidor(token);
    if (ok && pendiente) safeLocalStorageSet(CLAVE_APAGADA, JSON.stringify({ user: marca.user || null, pendiente: false }));
}

function _abrir(url) {
    const destino = typeof url === 'string' && url.startsWith('/') ? url : '/dashboard';
    try {
        if (window.location.pathname !== destino) {
            window.history.pushState({}, '', destino);
            window.dispatchEvent(new PopStateEvent('popstate'));
        }
    } catch {
        window.location.assign(destino);
    }
}

let _iniciado = false;

/** Una vez por arranque, solo en la app nativa. */
export async function iniciarPushNativa() {
    if (_iniciado || !isNativeApp()) return;
    _iniciado = true;
    const PN = (await _plugin())?.PN;
    if (!PN) return;
    try {
        if (nativePlatform() === 'android') {
            await PN.createChannel({
                // Mismo canal y MISMOS textos que los avisos locales (avisosDeComida._canalAndroid): recrearlo con otro
                // nombre lo renombraría en Ajustes de Android.
                id: CANAL_ANDROID, name: t('Recordatorios'), description: t('Tus comidas y el agua, a su hora.'),
                importance: 4, visibility: 1, vibration: true,
            });
        }
    } catch { /* sin canal propio, Android usa el genérico: el aviso sale igual */ }
    try {
        await PN.addListener('registration', (t) => {
            if (t?.value) {
                safeLocalStorageSet(CLAVE_TOKEN, t.value);
                enviarToken();
            }
        });
        await PN.addListener('pushNotificationActionPerformed', (ev) => _abrir(ev?.notification?.data?.url));
        await PN.addListener('pushNotificationReceived', async (n) => {
            const data = n?.data || {};
            if (data.solo_si_no_mira) return;   // el usuario ya lo está viendo en pantalla
            try {
                const { programarAvisoLocal } = await import('../utils/avisosDeComida');
                await programarAvisoLocal({
                    id: ID_AVISO_EN_PRIMER_PLANO, title: n?.title, body: n?.body,
                    at: new Date(Date.now() + 500), url: data.url || '/dashboard', kind: 'push',
                });
            } catch { /* se pierde solo el eco en primer plano */ }
        });
    } catch { /* sin listeners la push sigue llegando con la app cerrada */ }
    registrarSiHayPermiso();
    _reintentarBorradoPendiente();
    // Tras conceder el permiso (Configuración, o al generar un plan) y tras iniciar sesión: al volver a la app y cada
    // 5 min se reintenta; `enviarToken` no hace nada si ya está al día.
    // [P1-PLAN-LOTE-718] Con las alertas apagadas, lo único que se hace al volver es terminar un borrado pendiente.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (pushNativaApagada()) { _reintentarBorradoPendiente(); return; }
        registrarSiHayPermiso();
        enviarToken();
    });
    setInterval(() => { enviarToken(); }, 5 * 60 * 1000);
}
