// [P1-PAPER-SURFACE-SSOT · 2026-08-01] SSOT de las rutas que reciben la
// SUPERFICIE PAPEL (html[data-theme="paper"]): blanco y negro estricto,
// cuadrícula milimetrada, reglas de 1px.
//
// Por qué existe este módulo y no se reutiliza `marketingRoutes.js`:
// esa lista gobierna DOS cosas a la vez con alcances distintos —
//   · el header completo (nav segmentada + CTA), que vía `isLandingLike`
//     en Header.jsx cubre 19 patrones de ruta (marketing + legales +
//     novedades + /supermercado);
//   · el tema forzado, que cubre solo estas 6.
// Mientras las dos listas coincidan esto es un refactor de nombre con
// delta cero. En cuanto una superficie se mueva (p.ej. /supermercado a
// papel), tocar la lista equivocada cambiaría el header de 19 rutas de
// rebote — que es exactamente el accidente que esta separación evita.
//
// IMPORTANTE: mantener en sync con la copia literal del boot script de
// index.html (que no puede importar este módulo). El test
// backend/tests/test_p1_paper_surface_ssot.py ancla las dos copias.
export const PAPER_SURFACE_ROUTES = ['/', '/precios', '/como-funciona', '/funciones', '/precision', '/motor'];

export const isPaperSurface = (pathname) => PAPER_SURFACE_ROUTES.includes(pathname);
