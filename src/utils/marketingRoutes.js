// [P3-LANDING-DARK-ONLY · 2026-06-29 · alcance recortado P1-PAPER-SURFACE-SSOT · 2026-08-01]
// SSOT de las rutas públicas de marketing. Hoy gobierna UNA sola cosa:
//   · El header COMPLETO del landing (nav segmentada + CTA sticky) — ver Header.jsx,
//     donde `isLandingLike` la combina con legales + novedades + /supermercado
//     hasta 19 patrones de ruta.
//
// El TEMA ya NO se decide aquí: vive en src/utils/paperSurface.js (6 rutas).
// Eran la misma lista sirviendo a dos alcances distintos; separarlas evita que
// mover una superficie cambie el header de 13 rutas que no son marketing.
export const MARKETING_ROUTES = ['/', '/precios', '/como-funciona', '/funciones', '/precision', '/motor'];

export const isMarketingRoute = (pathname) => MARKETING_ROUTES.includes(pathname);
