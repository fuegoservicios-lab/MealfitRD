// [P1-PAPER-SURFACE-SSOT · 2026-08-01 · ampliado 2026-08-02] SSOT de las rutas
// que reciben la SUPERFICIE PAPEL (html[data-theme="paper"]): blanco y negro
// estricto, cuadrícula milimetrada, reglas de 1px.
//
// Por qué existe este módulo y no se reutiliza `marketingRoutes.js`:
// esa lista gobierna DOS cosas a la vez con alcances distintos —
//   · el header completo (nav segmentada + CTA), que vía `isLandingLike`
//     en Header.jsx cubre 19 patrones de ruta (marketing + legales +
//     novedades + /supermercado);
//   · el tema forzado, que cubre estas.
// La separación dejó de ser hipotética el 2026-08-02: la superficie papel se
// movió (de 6 rutas a 10 + 1 prefijo) y `MARKETING_ROUTES` NO se tocó. Tocar la
// lista equivocada habría cambiado el header de 19 rutas de rebote — que es
// exactamente el accidente que esta separación existe para evitar.
//
// [P1-PAPER-SURFACE-EXTEND · 2026-08-02] Las 4 rutas nuevas y por qué:
//   /research      — ya se sirve con `HowItWorksPage.module.css`, el mismo
//                    módulo (y el mismo bloque papel) de /como-funciona,
//                    /funciones y /precision. Era la única de las cuatro
//                    consumidoras que se quedaba en claro/oscuro.
//   /novedades     — el landing ya la enlaza desde «05 / REGISTRO» (una tabla
//   /novedades/:id   de revisiones en B/N): el índice es la versión larga de
//                    ese registro, no otra cosa. Cierra la deuda con fecha
//                    del spec §10.3.
//   /supermercado  — enlazada desde el footer de las 10 rutas de papel.
//   /about         — ídem, y su aurora animada era el último `filter: blur()`
//                    de una ruta pública alcanzable desde el pliego.
//
// [P1-PAPER-LEGAL · 2026-08-02] Las 9 páginas legales entran a la superficie.
// Eran lo último del diseño anterior: el footer de las 10 rutas de papel enlaza
// a TODAS ellas, así que el pliego terminaba en una tarjeta glass sobre un
// degradado azulado. Comparten `LegalPages.module.css` + `LegalPages.jsx`, cuya
// BASE se reescribió a papel (no un bloque escopado): el módulo no tiene ningún
// otro consumidor, y el criterio del repo reserva el escopado para los módulos
// COMPARTIDOS (Header, Footer, HowItWorksPage).
//   /cookies NO renderiza `LegalPages` — es un `<Navigate to="/privacy">`
//   (P3-COOKIES-MERGE) y por eso tampoco está en `LEGAL_PATHS`. Entra igual:
//   el boot script corre ANTES de que React resuelva el redirect, así que sin
//   ella una carga en frío de /cookies pinta un frame oscuro antes de saltar.
//
// PREFIJOS: `/novedades/:slug` es una ruta DINÁMICA — un `includes()` exacto no
// puede cubrirla y una entrada por slug drifta con `data/news.js`. Por eso hay
// una segunda lista de prefijos, con el mismo criterio que `newsRoutes.js` ya
// usaba para el header. Toda ruta dinámica futura entra por ahí, no por hardcode
// en el predicado.
//
// IMPORTANTE: mantener AMBAS listas en sync con la copia literal del boot script
// de index.html (que no puede importar este módulo). El test
// backend/tests/test_p1_paper_surface_ssot.py ancla las dos copias.
export const PAPER_SURFACE_ROUTES = [
    '/', '/precios', '/como-funciona', '/funciones', '/precision', '/motor',
    '/research', '/novedades', '/supermercado', '/about',
    '/privacy', '/terms', '/cookies', '/medical', '/data-protection',
    '/ai-policy', '/refunds', '/acceptable-use', '/responsible-disclosure',
];

export const PAPER_SURFACE_PREFIXES = ['/novedades/'];

export const isPaperSurface = (pathname) =>
    PAPER_SURFACE_ROUTES.includes(pathname)
    || PAPER_SURFACE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
