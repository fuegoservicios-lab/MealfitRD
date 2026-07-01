// [P3-NEWS-1 · 2026-07-01] SSOT de las rutas de Novedades. Consumidor: Header.jsx —
// estas rutas muestran el header COMPLETO del landing (nav + CTA), igual que las de
// marketing y las legales. Cubre el índice (/novedades) y las páginas de artículo
// (/novedades/<slug>) vía prefijo. El tema NO se fuerza aquí (respeta light/dark).
export const isNewsRoute = (pathname) =>
    pathname === '/novedades' || pathname.startsWith('/novedades/');
