// [P3-LANDING-DARK-ONLY · 2026-06-29] SSOT de las rutas públicas de marketing
// (landing + páginas de detalle + motor + precios). Dos cosas aplican a estas rutas:
//   1) El header COMPLETO del landing (nav segmentada + CTA sticky) — ver Header.jsx.
//   2) El tema OSCURO forzado (el landing no tiene configuración de apariencia y su
//      único modo por defecto es oscuro) — ver PublicThemeLock en App.jsx.
//
// IMPORTANTE: mantener en sync con el boot script inline de index.html (que fuerza
// oscuro síncrono en estas rutas para evitar flash en carga directa/refresh). No se
// puede importar este módulo desde index.html, así que ahí va una copia con comentario.
export const MARKETING_ROUTES = ['/', '/precios', '/como-funciona', '/funciones', '/precision', '/motor'];

export const isMarketingRoute = (pathname) => MARKETING_ROUTES.includes(pathname);
