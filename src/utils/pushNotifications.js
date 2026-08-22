import { fetchWithAuth } from '../config/api';

/**
 * Convierte un VAPID public key base64 a un Uint8Array para Web Push
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Comprueba si Push está soportado
 */
export const isPushSupported = () => {
    return 'serviceWorker' in navigator && 'PushManager' in window;
};

/**
 * Solicita permiso para mostrar notificaciones.
 * Retorna true si fue concedido, false si fue denegado.
 */
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        return false;
    }
    const permission = await Notification.requestPermission();
    return permission === 'granted';
};

/**
 * Suscribe el dispositivo y guarda el objeto de suscripción en el Backend.
 */
export const subscribeToPushNotifications = async () => {
    // [P2-I18N-PUSH-TOGGLE-ERROR-ES · 2026-08-22] Este util devuelve un CÓDIGO, no TEXTO
    // de pantalla. Antes componía la frase en español y `Settings.jsx` la pintaba cruda:
    // un francés en Brave recibía en español la ÚNICA pantalla que le explica cómo
    // arreglarlo. Es el mismo canal que `P1-I18N-SERVER-COPY-GANA` cerró para el backend:
    // quien conoce el idioma activo es quien RENDERIZA, no quien detecta el fallo.
    if (!isPushSupported()) return { success: false, code: 'push_unsupported' };
    
    // El frontend .env contiene esto
    const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!publicVapidKey) {
        console.error("No VITE_VAPID_PUBLIC_KEY configurado.");
        return { success: false, code: 'vapid_missing' };
    }

    try {
        let registration = await navigator.serviceWorker.getRegistration();
        
        // Si no hay registro activo, usar timeout para ready
        if (!registration) {
            registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((_, reject) => setTimeout(() => reject(new Error("Service Worker timeout")), 3000))
            ]);
        }

        if (!registration) {
            throw new Error("No hay Service Worker registrado.");
        }
        
        let subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
            });
        }

        const res = await fetchWithAuth('/api/notifications/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscription)
        });

        if (!res.ok) {
            throw new Error(`Error del servidor (${res.status})`);
        }

        return { success: true };
    } catch (err) {
        console.error("Error al suscribirse a push:", err);
        
        // Brave bloquea los servicios de Google Push (FCM) por defecto
        if (err.name === 'AbortError' || (err.message && err.message.includes('push service'))) {
            return { success: false, code: 'brave_blocks_push' };
        }
        
        // Sin código conocido: se pasa el mensaje del NAVEGADOR, que no es copy nuestro
        // (lo compone el motor y suele venir ya en el idioma del sistema).
        return { success: false, code: null, error: err.message };
    }
};

/**
 * [P3-AUDIT-4 · 2026-05-15] Listener del client-side que recibe `postMessage`
 * desde el SW cuando el browser dispara `pushsubscriptionchange` (rotación
 * de FCM credentials, refresh interno del browser, app reset). El SW ya
 * re-suscribió localmente vía `event.oldSubscription.options.applicationServerKey`
 * pero NO tiene access_token para POSTear al backend — el cliente lo hace
 * aquí con `subscribeToPushNotifications()` que reusa el `getSubscription()`
 * actual y reposta al endpoint `/api/notifications/subscribe`.
 *
 * Si no hay sesión activa (user logged out), `fetchWithAuth` fallará con 401
 * y el backend NO se actualizará — el operador del backend recibe un
 * endpoint zombie hasta que el user re-loguee. Es trade-off aceptado: sin
 * auth no podemos POSTear, y forzar re-login solo para sync push sería UX
 * intrusivo.
 *
 * Llamar `registerPushSubscriptionChangeListener()` UNA vez durante el
 * bootstrap del cliente (`main.jsx` o `App.jsx`). Idempotente: si se invoca
 * 2+ veces solo registra el handler una vez.
 *
 * Tooltip-anchor: P3-AUDIT-4-CLIENT-LISTENER | gap audit 2026-05-15
 */
let _pushSubChangeListenerRegistered = false;

export function registerPushSubscriptionChangeListener() {
    if (_pushSubChangeListenerRegistered) return;
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    _pushSubChangeListenerRegistered = true;

    navigator.serviceWorker.addEventListener('message', async (event) => {
        if (!event || !event.data || event.data.type !== 'pushsubscriptionchange') return;
        try {
            // `subscribeToPushNotifications` ya hace getSubscription() (que
            // ahora devuelve la nueva subscription re-creada por el SW) +
            // POST al backend con auth. Si falla (sin sesión / sin internet /
            // backend down), log y continue — la próxima vez que el cliente
            // bootstrap llamará el mismo flow.
            const result = await subscribeToPushNotifications();
            if (!result.success) {
                console.warn('[P3-AUDIT-4] Re-sync de push subscription falló:', result.error);
            }
        } catch (err) {
            console.warn('[P3-AUDIT-4] Excepción durante re-sync de push subscription:', err);
        }
    });
}

/**
 * Desuscribe el dispositivo y notifica al Backend.
 */
export const unsubscribeFromPushNotifications = async () => {
    if (!isPushSupported()) return true;

    try {
        let registration = await navigator.serviceWorker.getRegistration();
        
        if (!registration) {
            registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((_, reject) => setTimeout(() => reject(new Error("Service Worker timeout")), 3000))
            ]);
        }

        if (!registration) {
            return true; // Si no hay SW, no hay subscripción, consideramos que ya está desactivado
        }

        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
            try {
                // Notificar al backend pero no bloquear si el backend falla
                await fetchWithAuth('/api/notifications/unsubscribe', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ endpoint: subscription.endpoint })
                });
            } catch (backendErr) {
                console.error("No se pudo notificar al backend de la desuscripción:", backendErr);
            }
            
            await subscription.unsubscribe();
        }
        return true;
    } catch (err) {
        console.error("Error al desuscribirse de push:", err);
        return false;
    }
};
