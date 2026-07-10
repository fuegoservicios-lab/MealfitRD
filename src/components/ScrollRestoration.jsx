import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/* [SCROLL-RESTORE-REFRESH · 2026-06-19] Restaura la posición de scroll al
   REFRESCAR la página (o entrar directo por URL).

   Problema: el landing (y otras páginas) viven tras `ProtectedRoute` + chunks
   lazy. Cuando el navegador intenta su restauración nativa de scroll en un
   refresh, el contenido real aún no se montó (altura del documento ≈ 0), así que
   no puede restaurar y aterriza en el tope. Aunque refresques abajo, te manda
   arriba.

   Solución: guardamos `scrollY` por URL en sessionStorage (sobrevive el refresh,
   se limpia al cerrar la pestaña) y lo re-aplicamos cuando el contenido ya tiene
   altura suficiente. Solo en la PRIMERA carga real (refresh / entrada directa):
   la navegación cliente NO se toca, así que cada página conserva su propio
   `scrollTo(0, 0)` al navegar. Tampoco forzamos `scrollRestoration = 'manual'`
   para no romper el restore nativo de atrás/adelante del navegador.

   Cancelamos la restauración ante cualquier input del usuario (rueda, touch,
   teclado, pointer) para nunca pelear contra un scroll manual. */

const keyFor = (loc) => `mf:scroll:${loc.pathname}${loc.search}`;
const nowMs = () =>
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

// Módulo-level: el restore corre UNA sola vez por carga real del documento.
let didInitialRestore = false;

export default function ScrollRestoration() {
    const location = useLocation();
    const storageKey = keyFor(location);

    // --- Guardar la posición de la URL actual ---
    // [P2-SCROLL-SAVE-FLUSH-ONLY · 2026-07-09] Antes cada frame de scroll
    // escribía sessionStorage (rAF → setItem): trabajo síncrono de storage en
    // el hot path del scroll de TODAS las páginas, redundante porque el valor
    // solo se LEE en el próximo refresh/entrada directa. Ahora el scroll solo
    // anota scrollY en una variable local; la escritura a sessionStorage ocurre
    // únicamente en los flush points (pagehide, visibility hidden, cambio de
    // URL) — que ya existían y cubren todos los caminos hacia una recarga.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        let raf = 0;
        let lastY = null;
        const record = () => {
            raf = 0;
            lastY = Math.round(window.scrollY);
        };
        const persist = () => {
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            const y = lastY !== null ? lastY : Math.round(window.scrollY);
            try {
                sessionStorage.setItem(storageKey, String(y));
            } catch {
                /* sessionStorage no disponible (modo privado) → no-op */
            }
        };
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(record);
        };
        const onHide = () => persist();
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') persist();
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('pagehide', onHide);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('pagehide', onHide);
            document.removeEventListener('visibilitychange', onVisibility);
            persist(); // captura la posición saliente al cambiar de URL
        };
    }, [storageKey]);

    // --- Restaurar SOLO en la primera carga (refresh / entrada directa) ---
    const triedRef = useRef(false);
    useEffect(() => {
        if (triedRef.current || didInitialRestore) return undefined;
        triedRef.current = true;
        didInitialRestore = true;
        if (typeof window === 'undefined') return undefined;

        let target = 0;
        try {
            target = parseInt(sessionStorage.getItem(storageKey) || '0', 10) || 0;
        } catch {
            target = 0;
        }
        if (target < 40) return undefined; // nada relevante que restaurar

        let cancelled = false;
        const start = nowMs();
        const BUDGET_MS = 2500; // suficiente para que monten chunks lazy + splash

        const onUserInput = () => {
            cancelled = true;
            teardown();
        };
        const teardown = () => {
            window.removeEventListener('wheel', onUserInput);
            window.removeEventListener('touchstart', onUserInput);
            window.removeEventListener('keydown', onUserInput);
            window.removeEventListener('pointerdown', onUserInput);
        };
        window.addEventListener('wheel', onUserInput, { passive: true });
        window.addEventListener('touchstart', onUserInput, { passive: true });
        window.addEventListener('keydown', onUserInput);
        window.addEventListener('pointerdown', onUserInput, { passive: true });

        const tick = (ts) => {
            if (cancelled) return;
            const t = ts || nowMs();
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            // El contenido ya da la altura y nos desviamos del objetivo (p.ej. un
            // scrollTo(0,0) tardío de la página) → re-aplicamos.
            if (maxScroll >= target - 2 && Math.abs(window.scrollY - target) > 2) {
                window.scrollTo(0, target);
            }
            if (t - start < BUDGET_MS) {
                requestAnimationFrame(tick);
            } else {
                teardown();
            }
        };
        requestAnimationFrame(tick);

        return () => {
            cancelled = true;
            teardown();
        };
    }, [storageKey]);

    return null;
}
