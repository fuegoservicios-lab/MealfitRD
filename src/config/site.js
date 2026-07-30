/**
 * [P1-DOMAIN-CUTOVER-BIOBOROS · 2026-07-30] SSOT del dominio del sitio.
 *
 * Antes el dominio estaba HARDCODEADO en 8 sitios del frontend (redirect apex→app,
 * dos `ORIGIN` de canonical SEO, un link a /supermercado, dos textos legales,
 * una noticia, y los ficheros de `public/`). Migrar de `mealfitrd.com` a
 * `bioboros.com` obligó a tocarlos uno por uno — y el peligroso era
 * `App.jsx`, cuyo redirect duro mandaba al usuario al dominio VIEJO.
 *
 * Con estas constantes, el próximo cambio de dominio es una línea. Los ficheros
 * estáticos de `public/` (robots, sitemaps, security.txt) NO pueden importarlas
 * — son texto plano servido tal cual — así que siguen siendo edición manual y
 * quedan enumerados abajo para que nadie los olvide.
 *
 * Ficheros estáticos que también llevan el dominio:
 *   public/robots.txt · public/sitemap.xml · public/app-sitemap.xml
 *   public/.well-known/security.txt · index.html (og:url, canonical, JSON-LD)
 */

/** Dominio desnudo, sin protocolo ni subdominio. */
export const SITE_DOMAIN = 'bioboros.com';

/** Origen del sitio público (landing, legales, supermercado, SEO canonical). */
export const APEX_ORIGIN = `https://${SITE_DOMAIN}`;

/** Origen de la aplicación (login, dashboard). Ver P3-APP-SUBDOMAIN-ROUTING. */
export const APP_ORIGIN = `https://app.${SITE_DOMAIN}`;
