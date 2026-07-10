import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// [P2-SW-PRECACHE-HOST-SPLIT · 2026-07-09] El mismo build sirve DOS hosts con
// audiencias disjuntas (apex = marketing, app.* = producto; split
// P3-APP-SUBDOMAIN-ROUTING) pero el precache descargaba TODOS los chunks en
// ambos (~3.3MB / 94 entries en el primer install): el visitante del landing
// pagaba Dashboard/AgentPage/Pantry/… y el usuario del app pagaba
// Home/News/Legal/…. Filtramos el manifest por hostname ANTES de precachear.
// Solo se filtran chunks de PÁGINA identificables por nombre — vendor, shell y
// chunks compartidos se precachean siempre. Un chunk filtrado NO se rompe:
// simplemente se sirve por red si alguna vez se navega (degradación graciosa).
// SupermarketPage se deja en ambos (pública, linkeada desde el Footer del app).
const _IS_APP_HOST = /^app\./i.test(self.location.hostname);
const _APP_ONLY_CHUNKS = /(?:^|\/)(Dashboard|AgentPage|Pantry|Recipes|Settings|History|Plan|Assessment|AccountSettings|Upgrade|Login|ResetPassword|DashboardLayout|VirtualizedMessageList)-[A-Za-z0-9_-]+\.(?:js|css)$/;
const _MARKETING_ONLY_CHUNKS = /(?:^|\/)(Home|NewsPage|NewsArticlePage|AboutPage|ResearchPage|Engine|PricingPage|HowItWorksPage|FeaturesPage|PrecisionPage|LegalPages)-[A-Za-z0-9_-]+\.(?:js|css)$/;

// VitePWA inject-manifest will inject '_self.__WB_MANIFEST' here.
const _manifest = (self.__WB_MANIFEST || []).filter((entry) => {
    const url = typeof entry === 'string' ? entry : (entry && entry.url) || '';
    return _IS_APP_HOST ? !_MARKETING_ONLY_CHUNKS.test(url) : !_APP_ONLY_CHUNKS.test(url);
});
precacheAndRoute(_manifest);

// [P2-SW-FONTS-CACHE · 2026-07-09] Las fuentes self-hosted (/fonts/*.woff2,
// P3-SELF-HOST-FONTS) estaban fuera del precache (globPatterns no incluye
// woff2) y sin runtime caching → offline rompía la tipografía y cada arranque
// dependía de los headers HTTP del servidor. CacheFirst: inmutables por
// contenido, se cachean al primer uso (solo las que el navegador realmente
// pide, no las 6 del dir).
registerRoute(
    ({ request, url }) => request.destination === 'font' || url.pathname.startsWith('/fonts/'),
    new CacheFirst({
        cacheName: 'mealfit-fonts',
        plugins: [new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 365 * 24 * 60 * 60 })],
    }),
);

// [P3-PWA-CLEANUP · 2026-05-30] Purga precaches creados bajo un esquema de
// Workbox anterior (housekeeping de Cache Storage). injectManifest no lo añade
// automáticamente (solo generateSW lo hace).
cleanupOutdatedCaches();

// [P3-PWA-NAV-NETWORK-FIRST · 2026-06-13] Navegación = NETWORK-FIRST.
// Pre-fix (P3-PWA-NAV-FALLBACK · 2026-05-30): `createHandlerBoundToURL('index.html')`
// servía SIEMPRE el shell precacheado (cache-first). Efecto colateral: cambios de
// HTML/headers del servidor (p.ej. el CSP en nginx, o un index.html nuevo) NO
// llegaban al usuario hasta que limpiaba el cache a mano tras cada deploy.
// Ahora pedimos el documento a la RED primero (HTML + headers FRESCOS: CSP,
// etc.) y caemos al index.html precacheado SOLO si la red falla (offline) →
// preserva el fallback SPA offline que motivó P3-PWA-NAV-FALLBACK. El denylist
// excluye /api para no interceptar llamadas al backend.
registerRoute(new NavigationRoute(
    async ({ request }) => {
        try {
            // [P3-PWA-NAV-NOSTORE · 2026-06-16] `cache: 'no-store'` → el HTML se
            // pide SIEMPRE fresco de la red, saltándose el HTTP cache del
            // navegador. Sin esto, un reload normal podía servir un index.html
            // cacheado que referenciaba bundles JS/CSS viejos → el usuario tenía
            // que hacer HARD-refresh tras CADA deploy para ver los cambios. Con
            // el HTML fresco, sus nuevos hashes de assets se descargan de red
            // (precache miss) y un reload normal aplica el deploy. El precache
            // sigue como fallback offline. Usamos request.url (GET de
            // navegación) para evitar incompatibilidades del modo 'navigate'.
            return await fetch(request.url, { cache: 'no-store' });
        } catch (_offline) {
            return (await matchPrecache('index.html')) || Response.error();
        }
    },
    { denylist: [/^\/api\//] },
));

// [P2-PWA-SKIPWAITING · 2026-05-30] Activación bajo demanda (flujo "prompt") via
// postMessage SKIP_WAITING desde main.jsx cuando el usuario acepta el toast.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// [P3-PWA-SKIPWAITING-AUTO · 2026-06-16] Activación AUTOMÁTICA del SW nuevo en
// install + clients.claim en activate. Razón: en el PWA STANDALONE de iOS
// ("Agregar a inicio") el flujo 'prompt' casi nunca funciona — el toast "Nueva
// versión" rara vez se ve y el usuario quedaba corriendo un bundle viejo
// cacheado por DÍAS (no veía fixes; ej. la sesión first-party). skipWaiting hace
// que el SW nuevo tome control en el siguiente LANZAMIENTO del PWA, y con la
// navegación network-first+no-store ya sirve el bundle fresco. NO recarga la
// página en curso (el código nuevo aplica en la próxima navegación/lanzamiento)
// → sin reload abrupto a mitad de un formulario/chat (la preocupación de
// P2-PWA-SKIPWAITING era el reload de autoUpdate, no skipWaiting en sí).
self.addEventListener('install', () => {
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
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
