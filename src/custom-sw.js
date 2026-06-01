import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// VitePWA inject-manifest will inject '_self.__WB_MANIFEST' here.
precacheAndRoute(self.__WB_MANIFEST);

// [P3-PWA-CLEANUP · 2026-05-30] Purga precaches creados bajo un esquema de
// Workbox anterior (housekeeping de Cache Storage). injectManifest no lo añade
// automáticamente (solo generateSW lo hace).
cleanupOutdatedCaches();

// [P3-PWA-NAV-FALLBACK · 2026-05-30] Fallback de navegación SPA offline. Sin
// esto, un hard-reload o deep-link a una ruta client-side profunda
// (/dashboard/pantry, /history, …) SIN red fallaba al obtener el documento →
// pantalla de error del navegador en vez del shell de la app. Sirve el
// index.html precacheado para cualquier navegación; el denylist excluye /api
// para no interceptar llamadas al backend.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
}));

// [P2-PWA-SKIPWAITING · 2026-05-30] Activación bajo demanda (flujo "prompt").
// Sin un listener de SKIP_WAITING, el SW nuevo quedaba en estado 'waiting'
// indefinidamente mientras hubiera UNA pestaña abierta controlada por el SW
// viejo → el usuario seguía ejecutando el bundle viejo por días tras un deploy
// (incluido un fix de seguridad/datos). Ahora `registerType: 'prompt'`
// (vite.config) + el toast "Nueva versión" (main.jsx) postean este mensaje
// cuando el usuario acepta → el SW skip-waitea y toma control de forma
// controlada (sin reload abrupto a mitad de un formulario/chat).
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// ----------------------------------------------------------------------------
// Web Push Notifications Logic
// ----------------------------------------------------------------------------

self.addEventListener('push', (event) => {
    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: "Nuevo Mensaje", body: event.data.text() };
        }
    }

    const title = data.title || "Tu Nutricionista IA";
    const body = data.body || "Tienes un nuevo mensaje.";
    // Ensure we have a valid absolute URL for the icon
    const icon = "/favicon.png"; 
    
    // We attach data onto the notification so we can open it on click
    const notificationOptions = {
        body,
        icon,
        badge: icon,
        vibrate: [200, 100, 200, 100, 200, 100, 200], // Patterns let the user know!
        requireInteraction: true,
        data: {
            url: data.url || "/dashboard/agent"
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, notificationOptions)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // This looks to see if the current is already open and focuses if it is
    const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

    const promiseChain = clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    }).then((windowClients) => {
        let matchingClient = null;

        for (let i = 0; i < windowClients.length; i++) {
            const windowClient = windowClients[i];
            if (windowClient.url === urlToOpen) {
                matchingClient = windowClient;
                break;
            }
        }

        if (matchingClient) {
            return matchingClient.focus();
        } else {
            return clients.openWindow(urlToOpen);
        }
    });

    event.waitUntil(promiseChain);
});

// ----------------------------------------------------------------------------
// [P3-AUDIT-4 · 2026-05-15] Handler `pushsubscriptionchange`.
//
// Por qué existe: el browser puede invalidar y rotar credentials de push
// (FCM rotation, refresh interno, app reset) sin reinstalación del SW. El
// SW debe re-suscribirse para mantener notificaciones funcionales — sin
// este handler, las notificaciones simplemente dejan de llegar al usuario
// hasta que abra la app y `subscribeToPushNotifications()` corra durante
// el bootstrap del cliente.
//
// Adicional: la subscription en BD backend queda zombie con un endpoint
// inválido — backend intenta enviar notifs a un endpoint muerto, recibe
// 410 Gone, y debe limpiar. Mejor reportar la nueva subscription de
// inmediato.
//
// Estrategia (two-phase):
//   1. Re-subscribir DENTRO del SW usando `event.oldSubscription.options.
//      applicationServerKey` — el SW NO tiene access al VITE_VAPID_PUBLIC_KEY
//      del cliente, pero el navegador conserva el applicationServerKey
//      original en la oldSubscription. Si re-subscribe falla (browser
//      bloqueó, sin internet, etc.), no es fatal — el cliente lo arregla
//      en el próximo load via `subscribeToPushNotifications()` que llama
//      `getSubscription()` y reposta al backend.
//
//   2. Notificar via `postMessage` a CUALQUIER cliente abierto para que
//      reposte la nueva subscription al backend CON auth (SW no tiene
//      access_token). Si no hay clientes abiertos, el cliente lo
//      detectará en el próximo load (paso 1 ya re-suscribió localmente).
//
// Best-effort: TODO el handler envuelto en try/catch para que errores
// (e.g., `pushManager.subscribe` rejected con NotAllowedError) NO
// propaguen al runtime del SW (que mata el worker entero).
self.addEventListener('pushsubscriptionchange', (event) => {
    const promiseChain = (async () => {
        let newSubscription = null;

        // FASE 1: re-suscribir en el SW.
        try {
            const oldSub = event.oldSubscription;
            const applicationServerKey = oldSub && oldSub.options
                ? oldSub.options.applicationServerKey
                : null;
            if (applicationServerKey) {
                newSubscription = await self.registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey,
                });
            }
        } catch (_subErr) {
            // Re-subscribe falló (sin internet, VAPID inválido, browser
            // bloqueó). No fatal — el cliente lo arreglará en próximo load.
        }

        // FASE 2: avisar a clientes abiertos para que repostean al backend
        // con auth (SW no tiene access_token del usuario).
        try {
            const allClients = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            });
            const payload = {
                type: 'pushsubscriptionchange',
                subscription: newSubscription ? newSubscription.toJSON() : null,
            };
            for (const client of allClients) {
                try {
                    client.postMessage(payload);
                } catch (_pmErr) {
                    // postMessage puede fallar si el cliente se cerró
                    // entre matchAll y postMessage. Best-effort.
                }
            }
        } catch (_clientsErr) {
            // matchAll falló (raro). No fatal.
        }
    })();

    event.waitUntil(promiseChain);
});
