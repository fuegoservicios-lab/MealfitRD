// [P3-AVATAR-CYCLE · 2026-06-20] Store mínimo del avatar elegido. Persiste en
// localStorage y emite un CustomEvent para que TODOS los surfaces (avatar del
// perfil + avatar del sidebar) se sincronicen en vivo DENTRO del mismo tab — el
// evento 'storage' nativo solo cruza tabs, no el mismo. null = inicial (letra).
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';

const KEY = 'mealfit_avatar';
const EVT = 'mealfit:avatar-change';

export function getAvatarId() {
    return safeLocalStorageGet(KEY, null);
}

export function persistAvatar(id) {
    if (id) safeLocalStorageSet(KEY, id);
    else safeLocalStorageRemove(KEY);
    try {
        window.dispatchEvent(new CustomEvent(EVT, { detail: id || null }));
    } catch {
        /* SSR / entornos sin window — no-op */
    }
}

// Suscribe cb(id) a cambios (mismo tab vía CustomEvent + cross-tab vía storage).
// Devuelve una función de cleanup.
export function subscribeAvatar(cb) {
    const onEvt = (e) => cb(e && 'detail' in e ? e.detail : getAvatarId());
    const onStorage = (e) => { if (!e || e.key === KEY || e.key === null) cb(getAvatarId()); };
    window.addEventListener(EVT, onEvt);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(EVT, onEvt);
        window.removeEventListener('storage', onStorage);
    };
}
