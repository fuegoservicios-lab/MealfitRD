// [P3-LEGAL-HEADER-PARITY · 2026-06-30] SSOT de las rutas de páginas legales. Dos
// consumidores hoy:
//   1) Header.jsx — estas rutas muestran el header COMPLETO del landing (nav segmentada
//      + CTA sticky), NO la versión recortada. (El tema NO se fuerza oscuro aquí: las
//      legales respetan su propio light/dark, a diferencia de las de marketing.)
//   2) Footer.jsx — el back-link inteligente de LegalLayout no debe usar una página legal
//      como `from` (evita el loop Términos→Privacidad→Términos).
//
// IMPORTANTE: al añadir una política nueva (componente en LegalPages.jsx + ruta en
// App.jsx + link en el Footer), añadir también su path AQUÍ. No hacerlo fue exactamente
// el bug que dejó las 4 políticas nuevas con el header recortado (drift Header vs Footer).
export const LEGAL_PATHS = [
    // [P3-COOKIES-MERGE · 2026-06-30] /cookies eliminado: fusionado en /privacy (redirige).
    '/privacy',
    '/terms',
    '/medical',
    '/data-protection',
    '/ai-policy',
    '/research',
    '/refunds',
    // [P3-ACCEPTABLE-USE-PAGE · 2026-06-30] Política de Uso Aceptable.
    '/acceptable-use',
];

export const isLegalRoute = (pathname) => LEGAL_PATHS.includes(pathname);
