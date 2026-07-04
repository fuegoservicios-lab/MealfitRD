// [P3-MORE-INFO-MENU · 2026-07-03] SSOT de los enlaces del submenú "Más
// información" (estilo Claude.ai) — consumido por la card del menú de cuenta
// del sidebar (AccountMenu) y por el menú "más" móvil (DashboardLayout).
// Son páginas de marketing/legales cuya casa canónica es el APEX
// (mealfitrd.com): desde el app (app.mealfitrd.com) se abren en pestaña nueva
// para no perder el estado del dashboard.

// Reusa el patrón P3-LOGIN-LEGAL-LANDING (Login.jsx): en *.mealfitrd.com el
// enlace apunta al apex (sin el prefijo app.); en dev/preview devuelve la ruta
// in-app para que siga funcionando localmente.
export const landingUrl = (path) => {
  if (typeof window === 'undefined') return path;
  const { protocol, hostname } = window.location;
  if (/(^|\.)mealfitrd\.com$/i.test(hostname)) {
    return `${protocol}//${hostname.replace(/^app\./i, '')}${path}`;
  }
  return path; // dev / preview → ruta in-app
};

// [P3-HELP-MENU-ITEM · 2026-07-03] Correo de soporte del ítem "Obtener ayuda"
// (menú de cuenta desktop + menú "más" móvil). Mismo email canónico que
// Footer.jsx (P3-FOOTER-SUPPORT) y Upgrade.jsx.
export const SUPPORT_EMAIL = 'fuego.servicios@gmail.com';

// Grupos separados por divider (arriba: conocer el producto; abajo: legal).
export const MORE_INFO_GROUPS = [
  [
    { label: 'Acerca de MealfitRD', path: '/about' },
    { label: 'Novedades', path: '/novedades' },
    { label: 'Cómo funciona', path: '/como-funciona' },
    { label: 'Supermercado RD', path: '/supermercado' },
  ],
  [
    { label: 'Términos de servicio', path: '/terms' },
    { label: 'Política de privacidad', path: '/privacy' },
    { label: 'Aviso médico', path: '/medical' },
  ],
];
