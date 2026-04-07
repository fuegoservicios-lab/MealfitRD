import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Dynamically updates the <meta name="theme-color"> based on the current route.
 * This changes the color of the mobile browser status bar / system bar on Android
 * and the top bar in iOS standalone PWA mode, giving a more native feel per page.
 */
const useThemeColor = () => {
    const location = useLocation();

    useEffect(() => {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;

        const path = location.pathname;
        let color = '#4F46E5'; // Default brand

        if (path === '/login' || path === '/register' || path === '/reset-password') {
            color = '#020617'; // Dark auth pages
        } else if (path.startsWith('/dashboard/agent')) {
            color = '#FFFFFF'; // White for clean chat interface
        } else if (path.startsWith('/dashboard')) {
            color = '#F8FAFC'; // Light slate for dashboard pages
        } else if (path === '/') {
            color = '#F8FAFC'; // Landing page
        }

        meta.setAttribute('content', color);
    }, [location.pathname]);
};

export default useThemeColor;
