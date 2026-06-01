import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isDarkActive } from '../../utils/theme';

/**
 * Dynamically updates the <meta name="theme-color"> based on the current route.
 * This changes the color of the mobile browser status bar / system bar on Android
 * and the top bar in iOS standalone PWA mode, giving a more native feel per page.
 *
 * [APPEARANCE-THEME · 2026-05-28] Cuando el tema oscuro está activo, las
 * superficies dejan de ser blancas/slate-claras, así que la barra de estado
 * debe igualar la paleta oscura (slate-950 para páginas, slate-900 para el
 * chat). El detalle por-ruta del tema claro se preserva intacto.
 */
const useThemeColor = () => {
    const location = useLocation();

    useEffect(() => {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return undefined;

        const applyThemeColor = () => {
            const path = location.pathname;
            const dark = isDarkActive();

            let color;
            if (path === '/login' || path === '/register' || path === '/reset-password') {
                color = '#020617'; // Auth pages: ya oscuras en ambos temas
            } else if (dark) {
                // En oscuro, el chat usa la superficie de tarjeta (slate-900) y
                // el resto el fondo de página (slate-950).
                color = path.startsWith('/dashboard/agent') ? '#111827' : '#0B1120';
            } else if (path.startsWith('/dashboard/agent')) {
                color = '#FFFFFF'; // White for clean chat interface
            } else if (path.startsWith('/dashboard')) {
                color = '#F8FAFC'; // Light slate for dashboard pages
            } else if (path === '/') {
                color = '#F8FAFC'; // Landing page
            } else {
                color = '#4F46E5'; // Default brand
            }

            meta.setAttribute('content', color);
        };

        applyThemeColor();

        // [P3-THEME-COLOR-SYNC · 2026-05-30] `data-theme` NO es observable como
        // dependencia de React, así que un cambio de tema en Settings (o del SO
        // con pref='system') no re-corría este effect → la barra de estado
        // quedaba con el color del tema anterior hasta la siguiente navegación.
        // theme.js::applyThemePref despacha `mealfit-theme-change`; nos
        // suscribimos para re-sincronizar al instante.
        window.addEventListener('mealfit-theme-change', applyThemeColor);
        return () => window.removeEventListener('mealfit-theme-change', applyThemeColor);
    }, [location.pathname]);
};

export default useThemeColor;
