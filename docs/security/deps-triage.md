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

---

# Re-triage 2026-08-07 — 3 GHSA nuevos

[P1-DEPS-TRIAGE-2 · 2026-08-07] El gate falló con 3 advisories fuera de allowlist. Es el
comportamiento diseñado ("al aparecer un GHSA NUEVO el gate falla a propósito"). Uno se
cerró con un bump, uno no aplica, y **uno sí aplica y no tiene remediación desde este
repo** — ese último merece lectura completa, no un vistazo a la tabla.

| GHSA | Paquete | Veredicto | Acción |
|---|---|---|---|
| `GHSA-r28c-9q8g-f849` + `GHSA-fxqj-rqcc-2cmp` | postcss | Cerrado | override `^8.5.23` → resuelve 8.5.26 |
| `GHSA-qwww-vcr4-c8h2` | react-router | No aplica | allowlist |
| **`GHSA-qq9h-g4jm-xgf3`** | **better-auth** | **APLICA** | allowlist + acción pendiente con Neon |

## postcss — cerrado con override

`GHSA-r28c-9q8g-f849` (high, ≤8.5.17, path traversal vía `sourceMappingURL` → lectura
arbitraria de `.map`) y `GHSA-fxqj-rqcc-2cmp` (moderate, ≤8.5.22, fix incompleto del
anterior).

Llegaba por una cadena que vale la pena mirar antes de asustarse:

```
@neondatabase/neon-js → @neondatabase/auth → better-auth@1.4.18 → vitest@4.1.10 → vite → postcss
```

`better-auth` declara **vitest como dependencia de producción**, y por eso todo el
toolchain de build aparece bajo `npm audit --omit=dev`. postcss no entra al bundle del
navegador: es superficie de *build*, no de runtime. Aun así el override es de una línea y
sin riesgo, así que se aplicó en vez de allowlistear ruido.

`overrides.postcss = "^8.5.23"` (mismo mecanismo ya usado para `jspdf` y `dompurify`).

## react-router `GHSA-qwww-vcr4-c8h2` — no aplica

El advisory es de **RSC Mode** (CSRF bypass: la action se ejecuta antes del 400). Este
repo no usa RSC ni Framework Mode:

- 61/61 imports son `from 'react-router-dom'` (Declarative Mode).
- Cero `createBrowserRouter`, `@react-router/rsc`, `RSCHydratedRouter`,
  `matchRSCServerRequest`, `routeRSCServerRequest`, `useFetcher`, `<Form>`, `loader:`,
  `action:` de ruta.

Es la misma razón por la que `GHSA-84g9-w2xq-vcv6` fue "puro cumplimiento" en el triage
anterior. Además, el "fix" que propone npm es **bajar a 7.11.0** (`isSemVerMajor: true`),
que reintroduciría justamente `GHSA-84g9-w2xq-vcv6` — el advisory que el bump 7.12→7.18
cerró. Downgrade = estrictamente peor. Allowlist.

## better-auth `GHSA-qq9h-g4jm-xgf3` — ⚠ APLICA

**Este no encaja en el argumento del triage anterior, y conviene decirlo explícito.**

Los 9 GHSA de better-auth ya allowlisteados se aceptaron porque apuntan a plugins de
**servidor** que esta arquitectura no corre (oidcProvider, mcp, organization, admin,
SCIM). Ese razonamiento sigue siendo correcto para esos 9. **No cubre a este.**

### El mecanismo

> "When an account already exists for an address, magic-link verification and email-OTP
> sign-in both sign in to that account. Neither one removed a password set while the
> account was still unverified."

1. El atacante registra la dirección de la víctima con **una contraseña suya**. La cuenta
   queda sin verificar.
2. La víctima entra después por email-OTP. Better Auth la loguea **en esa misma cuenta** y
   verifica el correo.
3. La contraseña del atacante sigue viva. Acceso persistente, en paralelo al de la víctima.

Rango vulnerable `>=1.1.3 <1.6.22`; el árbol resuelve **1.4.18**. Parcheado en 1.6.22 /
1.7.0-beta.10: el fix borra la contraseña y revoca sesiones cuando el flujo encuentra una
cuenta nunca confirmada.

### Por qué aplica aquí y no es teórico

- **El login de esta app ES email-OTP, y es el único.** [P1-EMAIL-OTP · 2026-06-21]
  retiró `/register` (hoy `<Navigate to="/login">`) y `Login.jsx` es correo → código. No
  es un flujo de esquina: es la puerta.
- **La precondición 1 está documentada en nuestro propio código.** `authClient.js`:
  *"El primer código de un correo nuevo AUTO-CREA la cuenta (Better Auth
  `disableSignUp=false`, y Neon no expone forma de apagarlo)"*.
- **La superficie de contraseña está viva.** `AccountSettings.jsx` permite fijar/cambiar
  contraseña y `verifyCurrentPassword` hace POST a `<base>/sign-in/email` contra la
  instancia real de Neon.
- Que el SPA no tenga página de registro **no cierra nada**: el ataque es un POST directo
  a `<base>/sign-up/email`, y `VITE_NEON_AUTH_URL` viaja en el bundle.

Lo que expone una cuenta tomada: `meal_plans`, `health_profile`, `user_facts`,
`consumed_meals` — datos de salud.

### Por qué no hay remediación desde este repo

Dos capas, y la que importa no es la nuestra:

1. `better-auth@1.4.18` está pineado por `@neondatabase/auth@0.4.2-beta`; `neon-js@0.6.2-beta`
   es la última publicada. Un `overrides` subiría la copia del bundle.
2. **Pero la lógica vulnerable es del servidor de auth, y ese lo opera Neon.** Subir la
   copia cliente no parchea el sign-in de Neon. Aquí un override sería cosmético: pondría
   el gate en verde sin mover la exposición real.

Por eso va a la allowlist **como riesgo aceptado y rastreado**, no como "no aplica".

### Verificación pendiente (30 segundos, la puede correr el dueño)

Confirma la precondición 1 — sign-up abierto con contraseña. Usar **un correo propio sin
cuenta**, no el de un tercero:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$VITE_NEON_AUTH_URL/sign-up/email" \
  -H 'Content-Type: application/json' \
  -d '{"email":"TU-CORREO-SIN-CUENTA@ejemplo.com","password":"pruebaLarga123!","name":"probe"}'
```

`200`/`201` → sign-up abierto, precondición confirmada, la cadena completa es explotable.
`403`/`404`/`422` → Neon lo cerró y el ataque se queda sin paso 1.

### Acciones (necesitan a Neon, no a este repo)

1. Abrir ticket con Neon pidiendo better-auth ≥1.6.22 en la instancia gestionada. Es el
   único arreglo real.
2. Preguntar si pueden **deshabilitar email+password** en la instancia. La app es
   passwordless para entrar, así que sin contraseña que plantar el ataque se queda sin
   carga útil. **Ojo:** rompería el cambio de contraseña de `AccountSettings.jsx` — es
   una decisión de producto, no un flip gratis.
3. Mitigación parcial mientras tanto (la sugiere el propio advisory): borrar cuentas sin
   verificar de forma agresiva, para achicar la ventana. También depende de Neon.

Nota de severidad: `npm audit` lo reporta **high** (el paquete `better-auth` agrega a
`critical` por otros advisories). Un comentario previo en el PR #137 lo llamó "critical" y
sugirió que probablemente no aplicaba si no se usaba magic-link/email-OTP — **sí se usa
email-OTP**, y esa lectura era incorrecta.

## Allowlist tras este re-triage

```
GHSA-wxw3-q3m9-c3jr  GHSA-pw9m-5jxm-xr6h  GHSA-2vg6-77g8-24mp
GHSA-7w99-5wm4-3g79  GHSA-392p-2q2v-4372  GHSA-9h47-pqcx-hjr4
GHSA-86j7-9j95-vpqj  GHSA-g38m-r43w-p2q7  GHSA-fmh4-wcc4-5jm3
GHSA-qq9h-g4jm-xgf3  ← APLICA, aceptado y rastreado (no "no aplica")
GHSA-qwww-vcr4-c8h2  ← no aplica (RSC Mode; este repo es Declarative)
```
