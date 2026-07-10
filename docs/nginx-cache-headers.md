# Cache-Control en nginx (VPS Oracle) — política canónica

[P2-NGINX-CACHE-HEADERS · 2026-07-09] La política de cache HTTP de `index.html`
vs assets hasheados no vivía en NINGÚN lugar del repo — solo el workaround del
service worker (`custom-sw.js` navegación network-first + `no-store`), que solo
cubre navegaciones controladas por el SW. Un hard-refresh, la primera visita, o
un browser sin SW dependen de los headers del servidor.

## Snippet a aplicar en el server block HTTPS del VPS

> ⚠️ nginx NO hereda `add_header` a un `location` que define los suyos: cada
> `location` de abajo debe **re-incluir** `/etc/nginx/snippets/mealfit-security.conf`
> (los 6 security headers, ver P1-VERCEL-SECURITY-HEADERS · migrado a nginx
> 2026-06-12).

```nginx
# index.html (y cualquier navegación SPA): SIEMPRE revalidar contra el origen.
# "no-cache" NO significa "no cachear": significa "cachea pero revalida" —
# tras un deploy el browser obtiene el HTML nuevo con los hashes frescos.
location = /index.html {
    include /etc/nginx/snippets/mealfit-security.conf;
    add_header Cache-Control "no-cache";
}

# Assets con hash en el nombre (Vite: /assets/<name>-<hash>.js|css):
# inmutables por contenido → cache infinito sin revalidación.
location /assets/ {
    include /etc/nginx/snippets/mealfit-security.conf;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# Fuentes self-hosted (P3-SELF-HOST-FONTS): inmutables en la práctica.
location /fonts/ {
    include /etc/nginx/snippets/mealfit-security.conf;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# Service worker: el browser lo revalida por spec cada 24h, pero forzar
# revalidación inmediata acelera la propagación de deploys.
location = /custom-sw.js {
    include /etc/nginx/snippets/mealfit-security.conf;
    add_header Cache-Control "no-cache";
}
```

## Verificación post-aplicación

```bash
curl -sI https://app.mealfitrd.com/index.html | grep -i cache-control   # → no-cache
curl -sI https://app.mealfitrd.com/assets/<un-chunk>.js | grep -i cache-control  # → immutable
curl -sI https://app.mealfitrd.com/index.html | grep -i x-frame-options # → DENY (security headers presentes)
```

Con esto el aviso "Clear site data" tras cada deploy deja de ser necesario para
los usuarios de browser normal (el flujo PWA ya lo cubría el SW).
