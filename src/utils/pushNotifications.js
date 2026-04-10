import { fetchWithAuth } from '../config/api';

/**
 * Convierte un VAPID public key base64 a un Uint8Array para Web Push
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
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
    if (!isPushSupported()) return { success: false, error: "Push no soportado en este navegador." };
    
    // El frontend .env contiene esto
    const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!publicVapidKey) {
        console.error("No VITE_VAPID_PUBLIC_KEY configurado.");
        return { success: false, error: "No se configuró la llave VAPID." };
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
        return { success: false, error: err.message };
    }
};

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
