// Captura beforeinstallprompt en navegadores elegibles para ofrecer instalar la PWA desde el Centro y Ajustes.

let _deferredPrompt = null;
let _initialized = false;
const _listeners = new Set();

function _notify() {
    for (const cb of _listeners) {
        try { cb(); } catch { /* un listener roto no detiene a los demás */ }
    }
}

export function isStandalonePwa() {
    if (typeof window === 'undefined') return false;
    try {
        if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
        if (window.navigator?.standalone === true) return true;
    } catch { /* entorno sin matchMedia/navigator */ }
    return false;
}

export function canInstallPwa() {
    return Boolean(_deferredPrompt) && !isStandalonePwa();
}

export function subscribePwaInstall(cb) {
    if (typeof cb !== 'function') return () => {};
    _listeners.add(cb);
    return () => {
        _listeners.delete(cb);
    };
}

export function initPwaInstallCapture() {
    if (typeof window === 'undefined') return () => {};
    if (_initialized) return () => {};
    _initialized = true;

    const onBeforeInstallPrompt = (e) => {
        try { e.preventDefault?.(); } catch { /* noop */ }
        _deferredPrompt = e;
        _notify();
    };

    const onAppInstalled = () => {
        _deferredPrompt = null;
        _notify();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
        _initialized = false;
        window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        window.removeEventListener('appinstalled', onAppInstalled);
    };
}

export async function triggerPwaInstall() {
    const promptEvent = _deferredPrompt;
    if (!promptEvent || typeof promptEvent.prompt !== 'function') {
        return { outcome: 'unavailable' };
    }
    try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        _deferredPrompt = null;
        _notify();
        return choice || { outcome: 'dismissed' };
    } catch {
        _deferredPrompt = null;
        _notify();
        return { outcome: 'dismissed' };
    }
}

export function _resetPwaInstallForTests() {
    _deferredPrompt = null;
    _initialized = false;
    _listeners.clear();
}
