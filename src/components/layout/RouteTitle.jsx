import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/* [P3-ROUTE-TITLE · 2026-06-29] Título de pestaña por ruta, minimalista y coherente.
   Fuente única: antes solo index.html (estático) + 4 páginas de marketing seteaban
   título; el resto (login, dashboard, etc.) heredaba un título stale/incoherente.
   Esquema: "<Sección> · MealfitRD" para la app; el home conserva el título de marca.

   Las 4 páginas de marketing con SEO descriptivo propio (/motor, /como-funciona,
   /funciones, /precision) se auto-gestionan vía su useEffect → se listan en
   SELF_MANAGED para que este componente NO las pise. */

const BRAND = 'MealfitRD';

const TITLES = {
    '/': 'MealfitRD | Nutrición Personalizada con IA',
    '/login': `Iniciar sesión · ${BRAND}`,
    '/reset-password': `Restablecer contraseña · ${BRAND}`,
    '/assessment': `Crear mi plan · ${BRAND}`,
    '/plan': `Diseñando tu plan · ${BRAND}`,
    '/dashboard': `Mi plan · ${BRAND}`,
    '/dashboard/pantry': `Mi nevera · ${BRAND}`,
    '/dashboard/recipes': `Recetas · ${BRAND}`,
    '/dashboard/agent': `Asistente · ${BRAND}`,
    '/dashboard/settings': `Ajustes · ${BRAND}`,
    '/dashboard/upgrade': `Planes · ${BRAND}`,
    '/configuracion': `Ajustes · ${BRAND}`,
    '/history': `Historial · ${BRAND}`,
    '/precios': `Precios · ${BRAND}`,
    '/privacy': `Privacidad · ${BRAND}`,
    '/terms': `Términos · ${BRAND}`,
    '/cookies': `Cookies · ${BRAND}`,
    '/medical': `Aviso médico · ${BRAND}`,
};

const SELF_MANAGED = new Set(['/motor', '/como-funciona', '/funciones', '/precision']);

export default function RouteTitle() {
    const { pathname } = useLocation();
    useEffect(() => {
        const path = pathname.replace(/\/+$/, '') || '/';
        // Las páginas de marketing con título propio lo setean ellas mismas.
        if (SELF_MANAGED.has(path)) return;
        document.title = TITLES[path] || BRAND;
    }, [pathname]);
    return null;
}
