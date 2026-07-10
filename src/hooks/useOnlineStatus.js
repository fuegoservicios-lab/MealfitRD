// [P2-8 · 2026-07-09] Estado de conectividad reactivo. App PWA-first en un
// mercado de conectividad intermitente (es-DO móvil): antes navigator.onLine
// solo se leía REACTIVAMENTE al fallar un fetch (authErrors, main.jsx,
// PendingPipelineRecovery — cada uno por su cuenta). Este hook da la señal
// ambiental para el banner global y futuros gates de CTAs mutantes.
// useSyncExternalStore: el estado vive en el browser, cero setState-en-effect.
import { useSyncExternalStore } from 'react';

const _subscribe = (callback) => {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
    };
};

const _getSnapshot = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
const _getServerSnapshot = () => true;

/** @returns {boolean} true si el navegador reporta conexión. */
export function useOnlineStatus() {
    return useSyncExternalStore(_subscribe, _getSnapshot, _getServerSnapshot);
}
