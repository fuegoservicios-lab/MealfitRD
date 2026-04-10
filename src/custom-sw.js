import { precacheAndRoute } from 'workbox-precaching';

// VitePWA inject-manifest will inject '_self.__WB_MANIFEST' here.
precacheAndRoute(self.__WB_MANIFEST);

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
