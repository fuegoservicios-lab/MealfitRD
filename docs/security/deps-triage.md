# Triage de vulnerabilidades de dependencias (frontend)

[P1-DEPS-TRIAGE · 2026-07-12] Estado tras el batch de bumps de prod-readiness v3.

## Resumen

`npm audit` pasó de **24 → 5** vulnerabilidades. Las 5 residuales están TODAS en el
subárbol `@neondatabase/neon-js → @neondatabase/auth(-ui) → better-auth`, para el que
**no hay fix upstream** (better-auth ≤1.6.12 vulnerable; `@neondatabase/neon-js@0.6.2-beta`
es la última publicada y aún resuelve a `better-auth@1.4.18`).

| Paquete | Severidad | Fix disponible |
|---|---|---|
| `better-auth` (≤1.6.12) | **critical** (9 advisories) | ❌ no en neon-js |
| `@better-auth/passkey` | moderate | ❌ (depende de better-auth) |
| `@neondatabase/auth` | moderate | ❌ |
| `@neondatabase/auth-ui` | moderate | ❌ |
| `@neondatabase/neon-js` | moderate | ❌ |

## Bumps aplicados (fix disponible → aplicado)

| Paquete | Antes | Después | Advisory cerrado |
|---|---|---|---|
| `react-router-dom` + `react-router` | 7.12.0 | 7.18.1 | GHSA-84g9-w2xq-vcv6 (CSRF vía PUT/PATCH/DELETE document requests) |
| `dompurify` (override) | 3.4.7 | 3.4.12 | ≤3.4.10 |
| `vite` | 7.3.1 | 7.3.6 | path traversal dev-server + fs.deny bypass (dev only) |
| `rollup` | 4.58.x | 4.62.2 | GHSA-mw96-cpmx-2vgc (arbitrary file write) |
| cadena dev (babel, undici, brace-expansion, ajv, serialize-javascript vía workbox) | — | — | vía `npm audit fix` (sin `--force`) |

`react-router` 7.12→7.18 es aditivo para las 12 APIs que usa el repo (BrowserRouter,
Routes, Route, Navigate, useLocation, Outlet, useNavigate, useSearchParams, useParams,
useNavigationType, Link, MemoryRouter). El repo usa Declarative Mode puro (cero
`createBrowserRouter`/loaders/actions/Form/useFetcher), así que el advisory CSRF (rechazo
de submissions cross-origin en route actions) tiene superficie de comportamiento nula —
es puro cumplimiento. Verificado: build verde + suite 1407 passed tras el bump.

## Análisis del residual better-auth (por qué se acepta)

Los 9 advisories `critical`/`high` de better-auth apuntan mayoritariamente al **SERVIDOR
de auth** (oidc-provider, mcp plugin, organization plugin, admin/anonymous/SCIM flows,
rotación de refresh-tokens), NO al cliente. En esta arquitectura el servidor de auth lo
opera **Neon (managed)**; este bundle usa `@neondatabase/neon-js` solo como **cliente**
(`createClient` + `SupabaseAuthAdapter`: getSession / signInWithOtp / signOut / OAuth).
El frontend NO instancia `oidcProvider`, NO expone endpoints de token, NO corre el
organization/admin plugin.

Por advisory:

| GHSA | Superficie | Aplica al cliente? |
|---|---|---|
| GHSA-9h47-pqcx-hjr4 (oidcProvider alg=none / plain PKCE) | server oidcProvider | No — no corremos oidcProvider |
| GHSA-86j7-9j95-vpqj (stored XSS vía `javascript:` redirect_uri en oidc/mcp) | server oidc/mcp | No |
| GHSA-pw9m-5jxm-xr6h (refresh-token replay, oidc/mcp) | server oidc/mcp | No |
| GHSA-7w99-5wm4-3g79 / GHSA-392p-2q2v-4372 (concurrent redemption / rotation fork) | server token endpoint | No — token endpoint es de Neon |
| GHSA-2vg6-77g8-24mp (stale sessions tras user deletion; admin/anon/SCIM) | server admin/SCIM | No |
| GHSA-fmh4-wcc4-5jm3 (invitation acceptance, organization plugin) | server org plugin | No |
| GHSA-g38m-r43w-p2q7 (account takeover vía OAuth auto-link a email no verificado) | server OAuth linking | **Parcial** — depende de la config del servidor de Neon |
| GHSA-wxw3-q3m9-c3jr (OAuth callback acepta `state` mismatch sin PKCE) | server OAuth callback + cliente | **Parcial** — el flujo OAuth del cliente usa un `neon_auth_session_verifier` (verifier single-use, ver `main.jsx`), consistente con PKCE; la validación de `state` vive en el servidor de Neon |

Los dos "parciales" (GHSA-wxw3, GHSA-g38m) son responsabilidad del **servidor de Neon**,
no de este bundle. Acción de seguimiento: confirmar con Neon que (a) el callback OAuth
valida `state` + PKCE server-side y (b) el auto-link a emails no verificados está
deshabilitado.

## Decisión

**Aceptar con monitoreo.** No hay vía de remediación client-side (no existe versión de
neon-js con better-auth parcheado). Mitigaciones:

1. **Allowlist en CI** ([P1-2], `scripts/audit-gate.mjs`): los 9 GHSA critical de
   better-auth están allowlisteados; cualquier vuln high/critical NUEVA (fuera de esta
   lista) rompe el build. Los moderate no gatean.
2. **Issue upstream a Neon**: pedir bump de `better-auth` ≥1.6.13 en `@neondatabase/neon-js`.
   → **TODO: abrir el issue y linkear la URL aquí.**
3. **Re-triage** cuando Neon publique una neon-js nueva: correr `npm audit`, y si el
   subárbol se limpia, quitar los IDs de la allowlist del audit-gate.

### GHSA allowlisteados en `scripts/audit-gate.mjs`

```
GHSA-wxw3-q3m9-c3jr  GHSA-pw9m-5jxm-xr6h  GHSA-2vg6-77g8-24mp
GHSA-7w99-5wm4-3g79  GHSA-392p-2q2v-4372  GHSA-9h47-pqcx-hjr4
GHSA-86j7-9j95-vpqj  GHSA-g38m-r43w-p2q7  GHSA-fmh4-wcc4-5jm3
```

Si `npm audit` reporta un GHSA critical/high de better-auth que NO esté en esta lista,
significa un advisory nuevo → re-triage antes de allowlistear.
