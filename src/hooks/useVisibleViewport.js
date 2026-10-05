import { useCallback, useSyncExternalStore } from 'react';

// Follow the visible viewport directly: WKWebView may briefly resize innerHeight
// during keyboard opening, so subtracting the keyboard again can lift a modal twice.
export function useVisibleViewport(active) {
    const subscribe = useCallback((notify) => {
        const viewport = active && typeof window !== 'undefined' ? window.visualViewport : null;
        if (!viewport) return () => {};
        viewport.addEventListener('resize', notify);
        viewport.addEventListener('scroll', notify);
        window.addEventListener('resize', notify);
        return () => {
            viewport.removeEventListener('resize', notify);
            viewport.removeEventListener('scroll', notify);
            window.removeEventListener('resize', notify);
        };
    }, [active]);
    const getSnapshot = useCallback(() => {
        const viewport = active && typeof window !== 'undefined' ? window.visualViewport : null;
        if (!viewport || !(viewport.height > 0)) return '';
        return `${Math.max(0, viewport.offsetTop || 0)}:${viewport.height}`;
    }, [active]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => '');
    if (!snapshot) return undefined;
    const [top, height] = snapshot.split(':').map(Number);
    return { top, height, bottom: 'auto' };
}
