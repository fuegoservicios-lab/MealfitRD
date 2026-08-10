// [P3-MORE-INFO-MENU · 2026-07-03] SSOT de los enlaces del submenú "Más
// información" (estilo Claude.ai) — consumido por la card del menú de cuenta
// del sidebar (AccountMenu) y por el menú "más" móvil (DashboardLayout).
// Son páginas de marketing/legales cuya casa canónica para BUSCADORES es el apex
// (bioboros.com). Eso lo declara el `canonical` de cada página — NO tiene por qué
// decidir adónde manda un enlace de la app.
//
// [P1-MORE-INFO-IN-APP · 2026-08-10] Antes existía aquí un `landingUrl()` que
// reescribía `app.bioboros.com` → `bioboros.com`, y los cuatro sitios que lo usaban
// abrían además en PESTAÑA NUEVA. El dueño lo reportó como «entro en Novedades y me
// devuelve al dashboard».
//
// LO QUE PASABA, y no era un fallo suelto sino la suma de tres decisiones correctas
// por separado:
//   1. el enlace cambiaba de DOMINIO (por SEO),
//   2. abría en otra PESTAÑA (para no perder el dashboard),
//   3. y en el apex la app fuerza estado DESLOGUEADO a propósito
//      (P3-APEX-NO-SESSION: allí el sitio es marketing puro y la sesión vive por
//      origen).
// Juntas: tocabas «Novedades», aterrizabas en otro dominio como visitante anónimo, y
// al pulsar atrás Safari cerraba esa pestaña y te devolvía a la del dashboard.
//
// Medido antes de cambiar nada: las 7 páginas cargan igual de bien en `app.` que en
// el apex, con sesión y sin ella. O sea que salir del dominio no compraba nada al
// usuario que YA está dentro — solo le costaba su sesión.
//
// Ahora son rutas in-app normales. El apex sigue siendo la casa canónica para quien
// llega de Google, que es lo que el SEO necesitaba de verdad.
//
// Ya no hay helper de URL: era una indirección que solo servía para reescribir el
// host. Los consumidores usan `link.path` con el enrutador.

// [P3-HELP-MENU-ITEM · 2026-07-03] Correo de soporte del ítem "Obtener ayuda"
// (menú de cuenta desktop + menú "más" móvil). Mismo email canónico que
// Footer.jsx (P3-FOOTER-SUPPORT) y Upgrade.jsx.
export const SUPPORT_EMAIL = 'fuego.servicios@gmail.com';

// Grupos separados por divider (arriba: conocer el producto; abajo: legal).
export const MORE_INFO_GROUPS = [
  [
    { label: 'Acerca de Bioboros', path: '/about' },
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
