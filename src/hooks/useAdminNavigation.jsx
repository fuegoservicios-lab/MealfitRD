import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { safeLocalStorageGet } from '../utils/safeLocalStorage';

const AdminNavigation = createContext(null);
const read = (key, fallback, valid) => {
    try {
        const value = JSON.parse(sessionStorage.getItem(key));
        return valid(value) ? value : fallback;
    } catch { return fallback; }
};
const write = (key, value) => {
    if (!key) return;
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
};

// Only navigation is stored, per administrator and tab. Account data is always fetched again.
// eslint-disable-next-line react-refresh/only-export-components
export function useAdminNavigationState(name, fallback, valid = (v) => typeof v === typeof fallback && v !== null) {
    const navigation = useContext(AdminNavigation);
    const key = navigation?.key ? `${navigation.key}:${name}` : null;
    const [value, setValue] = useState(() => key ? read(key, fallback, valid) : fallback);
    const current = useRef(value);
    const update = useCallback((next) => {
        const result = typeof next === 'function' ? next(current.current) : next;
        current.current = result;
        write(key, result);
        setValue(result);
    }, [key]);
    return [value, update];
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminLoading(loading) {
    const navigation = useContext(AdminNavigation);
    const token = useRef(Symbol());
    useLayoutEffect(() => {
        if (!navigation || !loading) return undefined;
        const id = token.current;
        navigation.pending.add(id);
        return () => navigation.pending.delete(id);
    }, [navigation, loading]);
}

export function AdminNavigationProvider({ children }) {
    const [navigation] = useState(() => {
        const user = safeLocalStorageGet('mealfit_user_id', '');
        return { key: user ? `mf:admin-navigation:v1:${user}` : '', pending: new Set() };
    });
    useEffect(() => {
        if (!navigation.key) return undefined;
        const key = `${navigation.key}:scroll`;
        const target = read(key, 0, (v) => Number.isFinite(v) && v >= 0);
        let restoring = target > 0;
        let frame = 0;
        let stableSince = performance.now();
        const started = stableSince;
        let height = -1;
        const persist = () => { if (!restoring) write(key, Math.round(window.scrollY)); };
        const stop = () => { restoring = false; cancelAnimationFrame(frame); };
        const tick = () => {
            const now = performance.now();
            const nextHeight = document.documentElement.scrollHeight;
            if (nextHeight !== height || navigation.pending.size) stableSince = now;
            height = nextHeight;
            if (now - started > 30000 || (!navigation.pending.size && now - stableSince > 250)) {
                if (now - started <= 30000) window.scrollTo({ top: Math.min(target, Math.max(0, height - window.innerHeight)), behavior: 'instant' });
                stop();
                return;
            }
            frame = requestAnimationFrame(tick);
        };
        if (restoring) frame = requestAnimationFrame(tick);
        const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
        inputs.forEach((event) => window.addEventListener(event, stop, { passive: true }));
        const onVisibility = () => { if (document.visibilityState === 'hidden') persist(); };
        window.addEventListener('pagehide', persist);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            persist();
            cancelAnimationFrame(frame);
            inputs.forEach((event) => window.removeEventListener(event, stop));
            window.removeEventListener('pagehide', persist);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [navigation]);
    return <AdminNavigation.Provider value={navigation}>{children}</AdminNavigation.Provider>;
}
