# E2E tests (Playwright)

[P3-E2E-PLAYWRIGHT · 2026-05-12] Smoke tests del golden-path.

## Setup local

```bash
# Una vez tras `npm install`:
npm run test:e2e:install        # baja chromium browser binary (~150MB)

# Correr suite:
npm run test:e2e                # headless
npm run test:e2e:ui             # con UI interactiva

# Override de baseURL (ej. contra staging):
PLAYWRIGHT_BASE_URL=https://staging.mealfitrd.com npm run test:e2e
```

## Scope intencional

Cubre solo modos de fallo que **escapan** a:
- Vitest unit tests (~120 archivos) en `frontend/src/__tests__/`
- Parser-based tests (~80 archivos) en `backend/tests/`

Lo que SÍ chequea:
1. Home pública carga sin crash de hydration (cierre del modo `process.env`
   crash P0-FRONTEND-ANALYTICS).
2. Splash `#pwa-splash` se desmonta tras hydration.
3. Self-hosted fonts cargan desde `/fonts/*.woff2` y NO hay request a
   `fonts.gstatic.com` (cierre P3-SELF-HOST-FONTS).
4. Rewrite SPA de Vercel funciona — `/dashboard` no devuelve 404.

Lo que NO chequea (requiere staging Supabase aislado):
- Signup → assessment → plan generation → dashboard.
- Swap meal / restock / recipe expand.
- PayPal billing flow.

Ese flujo full-stack es follow-up cuando exista un entorno de staging.

## CI

El config corre `npm run preview` para servir el build production-like.
NO requiere backend levantado — los smoke tests son client-side puros.
Para añadir tests que requieran backend en el futuro, extender
`playwright.config.js` con un segundo `webServer` que arranque
`uvicorn` con un Supabase project de staging.
