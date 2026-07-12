# Frontend Production-Readiness v3 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar todos los gaps P1/P2/P3 de seguridad, velocidad, escalabilidad y código muerto encontrados en el audit v3 (2026-07-12) del frontend React 19/Vite 7, dejándolo production-ready sin gaps abiertos.

**Architecture:** 24 gaps clasificados por severidad (P0: 0 · P1: 6 · P2: 9 · P3: 9), cada uno implementable de forma independiente con su propio ciclo test→fix→verify→commit. Basado en audit de 4 agentes (seguridad/performance/robustez/dead-code) + build real + npm audit + suite completa.

**Tech Stack:** React 19, Vite 7, TanStack Query 5, Neon Auth (@neondatabase/neon-js), Vitest 4, Playwright, PWA (injectManifest), nginx en VPS Oracle.

## Global Constraints

- **Commits SIEMPRE scoped por pathspec (nunca `git add -A`)** — hay WIP del owner sin commitear en el árbol (`src/components/PendingPipelineRecovery.jsx` modificado, `src/__tests__/Dashboard.p3_banner_reason_copy.test.js` untracked). NO tocarlos ni foldearlos.
- **Tests backend parsean archivos frontend por path** (`backend/tests/test_p2_a11y_logging_frontend_anchors.py`, etc.). Todo borrado/renombre de archivo frontend requiere grep previo en `backend/tests/` y cambio coordinado el mismo día en ambos repos.
- **Anchors de parser**: si un test (frontend o backend) parsea source con regex, el código debe conservar el tooltip-anchor (`[Pn-…]`) para que un renombre falle el test antes de romper producción.
- **Deploy**: push del repo frontend → `deploy-mealfit.ps1` en el VPS → avisar "Clear site data" si aplica. El SW prompt-update cubre a los usuarios normales.
- **Baseline suite**: 1408 tests, 9 fallando en 4 archivos (pre-existentes, ver P1-2). Regla green-to-green: ningún task puede añadir fallos nuevos.
- **Decisiones de producto NO tocar**: i18n es-DO hardcoded, sesión JWT espejo en localStorage (iOS PWA, documentado), AuthBackground.jsx (export de design-sync), MotionConfig en DashboardLayout, zoom-lock del viewport (confirmado con owner).

## Métricas baseline (2026-07-12, para comparar al cierre)

| Métrica | Valor actual |
|---|---|
| Critical path JS (gzip, eager) | ~267KB = index 77.2 + vendor-react 69.8 + **vendor-neon-auth 89.2** + vendor-ui 30.9 |
| Precache SW | 94 entries / 3.2MB |
| Suite | 1408 tests · **9 fail / 4 files** · 49s |
| ESLint | 0 errors / **147 warnings** |
| tsc --noEmit | limpio |
| npm audit (prod deps) | **1 critical / 5 high / 6 moderate** |
| npm audit (total con dev) | 24 vulns |
| Archivos más grandes | Dashboard.jsx 8359 LOC · History.jsx 5000 · AssessmentContext.jsx 3746 · Pantry.jsx 3355 · AgentPage.jsx 3258 |
| CI | **No existe** (repo frontend sin `.github/`) |

---

# P0 — Críticos

**Ninguno encontrado.** Evidencia del cierre:

- **XSS**: los 2 builders de PDF (`Recipes.jsx:192-320`, `Dashboard.jsx:2926-3201`) escapan TODA interpolación LLM/usuario vía `escapeHtml` antes de `innerHTML`; `react-markdown` pasa siempre por `LazyMarkdown.jsx` con `rehypeSanitize` obligatorio; los 2 `dangerouslySetInnerHTML` (RecipesView/MobileRecipes:14) renderizan solo paths SVG estáticos; 0 `eval`/`new Function`/`document.write`.
- **Pagos**: tier server-derived del `plan_id` PayPal; sin fallbacks hardcoded; flujo limbo-safe (`Upgrade.jsx:371-391` solo navega en éxito). El gap de integridad de precio del cupón es P1-5 (no bloquea: requiere tampering local del propio comprador, y el tier en sí no escala).
- **Auth**: cookie `__Host-mf_session` + JWT verificado server-side; crypto real AES-GCM/HKDF en `secureFormStorage.js`; teardown de PII en logout centralizado.
- **Datos**: 0 escrituras directas a `meal_plans` desde el cliente (invariante I6 enforced por test backend); SW nunca cachea `/api` (denylist en `custom-sw.js:72`).
- **Build/dist**: build verde, typecheck verde, golden path defendido con recovery multi-capa.

---

# P1 — Altos (bloquean "production-ready", orden recomendado de ejecución)

### Task P1-1: Restaurar baseline verde de la suite (9 tests / 4 archivos)

**Files:**
- Diagnóstico: `src/__tests__/Header.sticky_cta.test.jsx` (4 fallos), `src/__tests__/History.audit_hist_10_chunk_metrics_tab.test.js`, `src/__tests__/History.rename_atomic.test.js`, `src/__tests__/Settings.test.jsx`
- Posibles fix: los componentes que testean (`Header.jsx`, `History.jsx`, `Settings.jsx`) o los propios tests

**Contexto:** los fallos de Header/History.audit_hist_10/Settings ya existían el 2026-07-09 ("del WIP del owner"); `History.rename_atomic` es nuevo desde entonces. Sin baseline verde, la CI (P1-2) no puede gatear.

- [ ] **Paso 1:** Reproducir cada fallo aislado: `npx vitest run src/__tests__/Header.sticky_cta.test.jsx` (y los otros 3). Capturar el assertion exacto.
- [ ] **Paso 2:** Para cada fallo, decidir con evidencia: (a) el test quedó stale respecto a un cambio INTENCIONAL del owner → actualizar el test al comportamiento actual; (b) regresión real → arreglar el componente. Regla: leer el git log del componente (`git log --oneline -5 -- src/components/layout/Header.jsx`) para ver qué cambió tras el 2026-07-09.
- [ ] **Paso 3:** `npx vitest run` completo → `Tests: 1408 passed` (o el nuevo total). 0 fallos.
- [ ] **Paso 4:** Commit scoped: `git add src/__tests__/Header.sticky_cta.test.jsx src/components/layout/Header.jsx ...` (solo los archivos tocados) → `fix(tests): restaurar baseline verde (9 tests stale/regresion) [P1-BASELINE-GREEN]`

**Verificación:** `npm test` → exit 0, 0 failed.

---

### Task P1-2: CI del repo frontend (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml` (en el repo frontend — es repo standalone con remote propio, github.com/fuegoservicios-lab/MealfitRD)
- Create: `scripts/audit-gate.mjs`

**Contexto:** hoy NADA corre en push: ni lint, ni tests, ni build. El `ci.yml` que se intentó en 2026-07-09 vivía en la raíz del workspace (que no es repo git) y nunca corrió. Dependencia: P1-1 (baseline verde).

**Interfaces:**
- Produces: workflow `ci` con jobs `quality` (lint+typecheck+test+build) y `audit` (gate de vulnerabilidades prod con allowlist).

- [ ] **Paso 1:** Crear `scripts/audit-gate.mjs` — gate de `npm audit --omit=dev` que falla en high/critical NO allowlisteados:

```js
// scripts/audit-gate.mjs — falla si hay vulns high/critical en deps de PRODUCCION
// fuera de la allowlist (advisories aceptados con triage documentado).
// Allowlist: docs/security/deps-triage.md debe justificar cada entrada.
import { execSync } from 'node:child_process';

const ALLOWLIST = new Set([
  // better-auth bundled en @neondatabase/neon-js 0.6.2-beta (sin fix upstream).
  // Triage: docs/security/deps-triage.md [P1-DEPS-TRIAGE]
  'GHSA-wxw3-q3m9-c3jr', 'GHSA-pw9m-5jxm-xr6h', 'GHSA-2vg6-77g8-24mp',
  'GHSA-7w99-5wm4-3g79', 'GHSA-392p-2q2v-4372', 'GHSA-9h47-pqcx-hjr4',
  'GHSA-86j7-9j95-vpqj', 'GHSA-g38m-r43w-p2q7', 'GHSA-fmh4-wcc4-5jm3',
]);

let report;
try {
  report = JSON.parse(execSync('npm audit --omit=dev --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch (e) {
  // npm audit sale con code!=0 cuando hay vulns; el JSON igual viene en stdout
  report = JSON.parse(e.stdout);
}
const bad = [];
for (const [name, adv] of Object.entries(report.vulnerabilities || {})) {
  if (!['high', 'critical'].includes(adv.severity)) continue;
  const ids = (adv.via || []).filter(v => typeof v === 'object').map(v => v.url?.split('/').pop());
  const unlisted = ids.filter(id => id && !ALLOWLIST.has(id));
  if (unlisted.length || ids.length === 0) bad.push(`${name} (${adv.severity}): ${unlisted.join(', ') || 'transitivo'}`);
}
if (bad.length) {
  console.error('[audit-gate] Vulns high/critical NO allowlisteadas en deps de produccion:\n - ' + bad.join('\n - '));
  process.exit(1);
}
console.log('[audit-gate] OK — sin vulns high/critical fuera de allowlist en prod deps.');
```

- [ ] **Paso 2:** Crear `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      # Tope de warnings = estado actual; P2-5 lo baja a 0.
      - run: npx eslint . --max-warnings 147
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: node scripts/audit-gate.mjs
```

- [ ] **Paso 3:** Validar localmente: `node scripts/audit-gate.mjs` → exit 0 con el mensaje OK (la allowlist cubre better-auth). `npx eslint . --max-warnings 147` → exit 0.
- [ ] **Paso 4:** Commit scoped + push → verificar en GitHub que el workflow corre verde en el primer push.
- [ ] **Paso 5 (opcional, no bloquea):** job e2e Playwright `continue-on-error: true` (el spec `e2e/golden_path.spec.js` puede estar stale — validarlo es tarea aparte).

**Verificación:** Actions tab → run verde. Romper algo a propósito en una rama (p.ej. un lint error) → run rojo.

---

### Task P1-3: Dependencias con CVE — bumps + triage documentado del critical

**Files:**
- Modify: `package.json` (deps + overrides), `package-lock.json`
- Create: `docs/security/deps-triage.md`

**Estado actual:** prod deps con 1 critical (better-auth 1.4.18 bundled en `@neondatabase/neon-js` 0.6.2-beta — **latest, sin fix upstream**), react-router-dom 7.12.0 (advisory CSRF, fix ≥7.14.2), dompurify 3.4.7 vía override (advisory ≤3.4.10). Dev deps: vite 7.3.1 (path traversal dev-server), rollup, babel, workbox-build→serialize-javascript, undici, brace-expansion, ajv — todos con fix vía `npm audit fix`.

- [ ] **Paso 1:** Bumps con fix disponible:

```bash
npm install react-router-dom@^7.18.1
# override dompurify: en package.json "overrides": { "dompurify": "^3.4.12" }
npm audit fix   # SIN --force (el --force intentaria romper neon-js)
npm run build && npm test
```

- [ ] **Paso 2:** Verificar el residuo: `npm audit --omit=dev` → deben quedar SOLO los advisories de better-auth/@neondatabase/*.
- [ ] **Paso 3:** Escribir `docs/security/deps-triage.md` con el análisis de los 9 advisories de better-auth **desde el punto de vista del cliente**: los advisories apuntan mayormente al SERVIDOR de auth (oidc-provider, organization plugin, admin flows, refresh-token rotation) que en esta arquitectura opera Neon (managed), no este bundle. Riesgo client-side residual: verificar que el flujo OAuth de la app usa PKCE (mitiga GHSA-wxw3-q3m9-c3jr) y que no se usa el oidcProvider client-side. Conclusión esperada: aceptar con monitoreo + allowlist en CI (P1-2) + issue abierto a Neon pidiendo bump de better-auth ≥1.6.13 en neon-js.
- [ ] **Paso 4:** Abrir el issue en el repo de @neondatabase/neon-js (o soporte Neon) y linkear su URL en el triage doc.
- [ ] **Paso 5:** `npm test && npm run build` verdes → commit scoped: `chore(deps): react-router-dom 7.18 + dompurify 3.4.12 + audit fix dev chain; triage better-auth [P1-DEPS-TRIAGE]`

**Verificación:** `npm audit --omit=dev` → 0 vulns fuera de @neondatabase/*; `node scripts/audit-gate.mjs` → OK; app smoke (login + navegación) porque react-router subió 6 minors.

---

### Task P1-4: Watchdog de inactividad en el SSE de generación (spinner de 13 min en desktop)

**Files:**
- Modify: `src/pages/Plan.jsx:251-264` (timeout de conexión) y `:291-358` (loop de lectura), reconciliador `:627-719`
- Test: `src/__tests__/Plan.sse_idle_watchdog.test.jsx` (nuevo)

**Evidencia:** el `setTimeout` que aborta por `PIPELINE_TIMEOUT_MS` se limpia al llegar los headers (`clearTimeout(timeoutId)` en `:264`) — durante el `while(true){ reader.read() }` no hay NINGÚN timeout, y los `heartbeat` se ignoran con `continue` (`:313`). En desktop no hay eventos de resume (visibilitychange/focus), así que el reconciliador `[P1-MOBILE-RECOVERY-RESUME]` solo actúa con `elapsed > 13*60` (`:667-668`). Stream muerto en silencio (proxy idle-timeout, cambio de red) = spinner "Diseñando tu plan" hasta ~13 minutos.

**Diseño del fix** (watchdog re-armado por byte recibido; el heartbeat del backend cuenta como señal de vida):

```js
// [P1-SSE-IDLE-WATCHDOG · 2026-07-12] Sin bytes (ni heartbeat) en N segundos
// → abortar el stream y delegar YA en el reconciliador pending-status (que hoy
// solo actuaba en resume móvil o a los 13 min). Knob env con default 75s
// (el backend emite heartbeat cada ~15s → 5 heartbeats perdidos = muerto).
const SSE_IDLE_MS = (() => {
  const v = parseInt(import.meta.env.VITE_SSE_IDLE_TIMEOUT_MS ?? '75000', 10);
  return Number.isFinite(v) && v >= 15000 ? v : 75000;
})();
let idleTimer = null;
let idleTripped = false;
const armIdleWatchdog = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTripped = true;
    try { globalAbortController?.abort(); } catch { /* ya abortado */ }
  }, SSE_IDLE_MS);
};

armIdleWatchdog();
try {
  while (true) {
    const { done, value } = await reader.read();
    armIdleWatchdog(); // cualquier byte (heartbeat incluido) re-arma
    if (done) break;
    // ... parsing actual sin cambios ...
  }
} finally {
  clearTimeout(idleTimer);
}
```

Y en el catch del abort: si `idleTripped`, NO mostrar el error genérico — setear el mismo flag que usa el reconciliador para `act=true` en su próximo tick (forzar un chequeo inmediato de `pending-status`): si el KV backend dice `complete` → rescatar el plan como hace el flujo de resume; si dice `generating` → reanudar UI de espera con el poll (sin SSE); si `error/none` → CTA de reintento.

- [ ] **Paso 1 (test primero):** test que mockea `fetch` devolviendo un `ReadableStream` que emite 2 chunks y luego se queda mudo; con fake timers avanzar `75s` → assert que se llamó `abort` y que se disparó el chequeo de `pending-status` (mock del endpoint). Correr → FALLA.
- [ ] **Paso 2:** Implementar el watchdog como arriba (respetar el estilo de comments-anchor del archivo).
- [ ] **Paso 3:** Cablear `idleTripped` → reconciliación inmediata (reusar la función existente del reconciliador; NO duplicar su lógica).
- [ ] **Paso 4:** `npx vitest run src/__tests__/Plan.sse_idle_watchdog.test.jsx` → PASS. Suite completa verde. Smoke manual: generar un plan real en dev y verificar que el heartbeat NO dispara el watchdog.
- [ ] **Paso 5:** Commit scoped: `fix(plan): watchdog de inactividad SSE + reconciliacion inmediata [P1-SSE-IDLE-WATCHDOG]`

**Verificación:** test nuevo PASS; generación real completa sin falsos positivos (mirar console en dev con throttling de red).

---

### Task P1-5: Integridad de precio del cupón PayPal (verify-first)

**Files:**
- Verificar primero: `backend/routers/billing.py` (endpoint `/api/subscription/verify` + `/api/discount/validate`)
- Modify (frontend): `src/components/dashboard/PaymentModal.jsx:143-179`
- Posible modify (backend, coordinado): `routers/billing.py`

**Evidencia:** `PaymentModal.jsx` calcula `finalPrice` client-side desde `couponResult.discount_percent` (respuesta de `/api/discount/validate`) y lo inyecta como `plan.billing_cycles[0].pricing_scheme.fixed_price` al crear la suscripción PayPal (`:148-179`). Un usuario puede manipular `finalPrice` en DevTools y crear la suscripción con primer ciclo a precio arbitrario. El TIER no escala (server-derived del plan_id), pero el MONTO del primer ciclo sí es manipulable **si el backend no re-verifica**.

- [ ] **Paso 1 (VERIFICAR, no asumir):** leer en el backend qué hace `/api/subscription/verify` con el monto: ¿consulta la suscripción real a PayPal (`GET /v1/billing/subscriptions/{id}`) y compara `billing_info`/pricing contra el precio esperado del plan± cupón validado? `grep -n "discount\|fixed_price\|billing_info" backend/routers/billing.py`
- [ ] **Paso 2 — Si el backend NO re-verifica (esperado):** implementar la verificación server-side: el verify recibe `subscriptionID` (+ `coupon_code` si se usó), consulta a PayPal el subscription real, computa el precio esperado = precio de lista del plan_id − descuento del cupón (re-validado server-side contra su tabla), y si `fixed_price` reportado < esperado → NO activar tier, persistir `billing_alert` y devolver 409. (Reusar el patrón `_persist_billing_alert` de I-Billing-3.)
- [ ] **Paso 3 (frontend, defensa-en-profundidad):** enviar `coupon_code` en el payload del verify (si no viaja ya) para que el backend re-valide contra SU fuente y no contra el precio del cliente. El `pricing_scheme` client-side puede quedarse (es lo que PayPal soporta para revisar el primer ciclo desde JS SDK) — la autoridad pasa a ser el verify.
- [ ] **Paso 4 (tests):** backend: test del verify con monto manipulado → 409 + alert. Frontend: test de que el verify payload incluye `coupon_code`.
- [ ] **Paso 5:** Commits coordinados mismo día (backend primero, luego frontend). Backend bump `_LAST_KNOWN_PFIX` + test con slug (convención del repo backend).
- [ ] **Paso 6 — Si el backend YA re-verifica:** documentar la evidencia (file:line) en `docs/security/deps-triage.md` § "pricing integrity" y cerrar este task sin cambios (reclasificado P3-defensa).

**Verificación:** intento manual en sandbox PayPal con `finalPrice` manipulado en DevTools → tier NO activado + alert persistida.

---

### Task P1-6: Aplicar la política de cache de nginx en el VPS (doc listo desde 2026-07-09)

**Files:**
- Fuente: `docs/nginx-cache-headers.md` (ya escrito, política canónica completa)
- Target: VPS Oracle `/etc/nginx/sites-*/` (server block HTTPS) — tarea de ops, no de repo

**Evidencia:** sin estos headers, `index.html` puede quedar cacheado por browsers/intermediarios tras un deploy; el workaround del SW (network-first + no-store) solo cubre navegaciones controladas por SW. Hard-refresh, primera visita o browser sin SW pueden servir HTML stale → hashes viejos → chunk errors (mitigados por el reload-guard, pero es el síntoma, no la causa).

- [ ] **Paso 1:** SSH al VPS → backup del server block actual (`sudo cp` con timestamp).
- [ ] **Paso 2:** Aplicar el snippet del doc: `location = /index.html` → `Cache-Control: no-cache` + re-include del snippet de security headers; `location /assets/` → `Cache-Control: public, max-age=31536000, immutable` + re-include; ídem para los estáticos raíz que el doc enumera. ⚠️ nginx NO hereda `add_header` en locations que definen los suyos — CADA location re-incluye `/etc/nginx/snippets/mealfit-security.conf`.
- [ ] **Paso 3:** `sudo nginx -t` → OK → `sudo systemctl reload nginx`.
- [ ] **Paso 4:** Verificación desde fuera:

```bash
curl -sI https://app.mealfitrd.com/index.html | grep -iE "cache-control|strict-transport"
# Esperado: Cache-Control: no-cache + HSTS presente (security headers preservados)
curl -sI https://app.mealfitrd.com/assets/$(curl -s https://app.mealfitrd.com/ | grep -o 'assets/index-[^"]*\.js' | head -1 | cut -d/ -f2) | grep -i cache-control
# Esperado: public, max-age=31536000, immutable
```

- [ ] **Paso 5:** Marcar el doc como APLICADO (fecha) en su encabezado; commit scoped del doc.

**Verificación:** los 2 curl de arriba + smoke de la app (headers de seguridad intactos en ambas locations).

---

# P2 — Medios

### Task P2-1: Sacar el SDK de Neon Auth del critical path (−89KB gzip eager)

**Files:**
- Modify: `src/authClient.js` (import estático → dynamic import con singleton), `src/context/AssessmentContext.jsx:6`, `src/hooks/useRegeneratePlan.js:8`, `src/pages/AccountSettings.jsx:22`, `src/pages/Login.jsx:2`, `src/pages/ResetPassword.jsx:2` (Register.jsx muere en P2-7)
- Test: `src/__tests__/authClient.lazy.test.js` (nuevo)

**Evidencia:** `vendor-neon-auth` = 359KB min / **89.2KB gzip** y está en el `<link rel="modulepreload">` del `dist/index.html` (eager) porque `AssessmentContext` (eager en App.jsx) importa `authClient.js` → `@neondatabase/neon-js` estático. La landing de marketing (apex) paga el SDK completo para visitantes que jamás inician sesión. Es el 33% del critical path JS.

**Diseño:** facade async con el mismo shape — el cliente real se crea en el primer uso:

```js
// authClient.js — [P2-NEON-LAZY · 2026-07-12] El SDK (~89KB gzip) sale del
// entry: dynamic import en el primer uso. Promise singleton = una sola init.
let _clientPromise = null;
export function getAuthClient() {
  if (!_clientPromise) {
    _clientPromise = import('@neondatabase/neon-js').then(({ createClient, SupabaseAuthAdapter }) =>
      createClient(/* misma config actual, copiar verbatim */));
  }
  return _clientPromise;
}
// Facade con los métodos que el codebase usa HOY (enumerar por grep en Paso 1):
export const authClient = {
  auth: {
    getSession: async (...a) => (await getAuthClient()).auth.getSession(...a),
    onAuthStateChange: (...a) => { /* wrapper: subscribe tras resolver; devolver unsubscribe proxy */ },
    signInWithOtp: async (...a) => (await getAuthClient()).auth.signInWithOtp(...a),
    signOut: async (...a) => (await getAuthClient()).auth.signOut(...a),
    // ...resto según grep
  },
};
```

- [ ] **Paso 1:** Inventario exacto de la API usada: `grep -rn "authClient\.\w*\.\w*" src --include="*.jsx" --include="*.js" | grep -v test` → lista de métodos que la facade debe cubrir (especial atención a `onAuthStateChange`: es síncrono hoy — el wrapper debe encolar la suscripción y devolver un objeto `{ data: { subscription: { unsubscribe } } }` proxy).
- [ ] **Paso 2 (test primero):** test que importa `authClient` y verifica que `@neondatabase/neon-js` NO se evaluó (mock del módulo con spy de factory) hasta llamar `authClient.auth.getSession()`.
- [ ] **Paso 3:** Implementar facade. En `AssessmentContext`, el boot de sesión ya es async — no debería cambiar la semántica; el splash sigue esperando `mealfit:app-ready`.
- [ ] **Paso 4:** En rutas de marketing (apex), diferir el primer `getSession()` a `requestIdleCallback` (guard con `isMarketingRoute(location.pathname)` ya existente) para que la landing NUNCA cargue el SDK salvo interacción de login.
- [ ] **Paso 5:** `npm run build` → verificar en `dist/index.html` que `vendor-neon-auth-*.js` YA NO está en modulepreload; el chunk se sirve on-demand. Login/logout/OAuth smoke completo (incluye el flujo verifier de `main.jsx:52-55`).
- [ ] **Paso 6:** Suite verde + commit: `perf(auth): SDK Neon lazy via facade — -89KB gzip del critical path [P2-NEON-LAZY]`

**Verificación:** `grep -o 'assets/[^"]*\.js' dist/index.html` sin vendor-neon-auth; login normal + OAuth Google + reset password + logout funcionan; Lighthouse del apex mejora TBT/LCP.

**Riesgo/rollback:** flujo OAuth con verifier es sensible al timing — probar en dev Y prod-preview. Rollback = revertir el commit (facade es drop-in).

---

### Task P2-2: Debounce del autosave del wizard + cache de CryptoKey (jank de teclado)

**Files:**
- Modify: `src/context/AssessmentContext.jsx:1972-1995` (effect de guardado), `src/config/secureFormStorage.js:184-224` (deriveAesKey/encryptObject)
- Test: ampliar `src/__tests__/` specs de secureFormStorage existentes

**Evidencia:** el effect guarda con deps `[formData, session, loadingSensitive]` sin debounce → cada tecla = `JSON.stringify` + `localStorage.setItem` síncrono + (autenticado) HKDF-SHA256 **re-derivando la CryptoKey** + AES-GCM encrypt. En los textarea de texto libre es jank medible en gama baja.

- [ ] **Paso 1 (test primero):** test de secureFormStorage: 2 llamadas seguidas a `saveFormData` con el mismo secret → `crypto.subtle.deriveKey` llamado UNA vez (spy). Test del context: 3 `updateData` en <400ms → 1 solo `setItem` (fake timers).
- [ ] **Paso 2:** Cache de clave en secureFormStorage:

```js
let _cachedKey = null, _cachedForSecret = null;
async function _getAesKey(secret) {
  if (_cachedKey && _cachedForSecret === secret) return _cachedKey;
  _cachedKey = await deriveAesKey(secret);
  _cachedForSecret = secret;
  return _cachedKey;
}
// invalidar en setFormCryptoSecret() y en clearFormStorage()
```

- [ ] **Paso 3:** Debounce 400ms en el effect del context (timer en el effect, `return () => clearTimeout(t)`), + **flush inmediato** en: cambio de paso del wizard (avanzar/retroceder) y `beforeunload`/`pagehide` (guardado síncrono best-effort del blob público; el cifrado async puede perderse en unload — aceptable, el blob público es el fallback documentado).
- [ ] **Paso 4:** Suite verde; smoke manual del wizard (escribir en `motivation`, refresh a mitad → datos restaurados).
- [ ] **Paso 5:** Commit: `perf(wizard): debounce 400ms autosave + cache CryptoKey HKDF [P2-FORM-SAVE-DEBOUNCE]`

**Verificación:** tests nuevos PASS; refresh a mitad de wizard restaura todo (incl. sensibles cifrados); Performance profiler: 0 long tasks por keystroke.

---

### Task P2-3: Manejo centralizado de sesión expirada (401)

**Files:**
- Modify: `src/config/api.ts:124-181` (fetchWithAuth), `src/context/AssessmentContext.jsx` (listener)
- Revisar callers que tragan 401: `src/pages/Pantry.jsx:1434-1437`, `src/components/PendingPipelineRecovery.jsx:93`, chunk-poll de Dashboard
- Test: `src/__tests__/api.session_expired.test.js` (nuevo)

**Evidencia:** `fetchWithAuth` nunca intercepta 401; cada surface reacciona distinto — History muestra estado correcto, pero Pantry hace `toast.error('Error al actualizar alimento')` + refetch que también 401ea → **la nevera parece vaciarse**; otros quedan en estado vacío silencioso. No hay camino de re-auth salvo reload.

**Diseño:** señal única + handler único:

```ts
// api.ts, tras obtener res en fetchWithAuth:
if (res.status === 401 && !path.startsWith('/auth')) {
  window.dispatchEvent(new CustomEvent('mealfit:session-expired', { detail: { path } }));
}
return res; // los callers conservan su manejo local (no rompemos contratos)
```

En `AssessmentContext` (dueño de la sesión): listener con once-guard (ref) → `toast('Tu sesión expiró — vuelve a iniciar sesión')` + teardown de sesión existente (`handleAuthChange(null)` ya purga caches PII) + redirect a `/login`. El once-guard evita la tormenta de toasts cuando N polls fallan a la vez.

- [ ] **Paso 1 (test primero):** mock fetch → 401 en un endpoint no-auth → assert evento disparado; listener del context → assert toast + teardown llamados UNA vez aunque lleguen 3 eventos.
- [ ] **Paso 2:** Implementar emisión + listener + once-guard.
- [ ] **Paso 3:** Auditar los callers que tragan 401 para que no pisen la UX (el toast global ya informa; sus catches locales pueden quedarse, pero Pantry NO debe mostrar "Error al actualizar alimento" en 401 — early-return si `res.status === 401`).
- [ ] **Paso 4:** Suite verde. Smoke: borrar la cookie/`mealfit_mf_session` en DevTools con la app abierta → siguiente acción muestra el toast + redirect limpio.
- [ ] **Paso 5:** Commit: `fix(auth): 401 centralizado — evento session-expired + redirect unico [P2-401-CENTRAL]`

**Verificación:** smoke del Paso 4 en Pantry (caso "nevera vaciada") + Dashboard.

---

### Task P2-4: Borrado de código muerto seguro (0 referencias verificadas, cero coordinación)

**Files:**
- Delete: `src/components/home/PricingCta.jsx` (46 LOC), `src/components/home/PricingCta.module.css` (186 LOC), `src/components/common/Skeleton.jsx` (38 LOC), `public/auth_bg_new.png` (655KB), `public/auth_bg_new.webp` (43.5KB), `public/favicon-192.png` (10.5KB), `tmp/plan_check.js` (untracked, local)
- Modify: `vite.config.js:75` (quitar `'auth_bg_new.png'` de globIgnores), `.env` + `.env.production` + `.env.example` (quitar `VITE_LIKE_WEBHOOK`/`VITE_SWAP_WEBHOOK`, 0 usos en src), `src/pages/Home.jsx:9` (quitar el comment "PricingCta queda disponible…")

**Evidencia (re-verificada por agente):** 0 imports/refs en frontend Y 0 hits en `backend/tests/` para cada uno. `auth_bg_new` solo aparece en comments (el fondo actual es CSS gradient). `Skeleton.jsx` nunca fue adoptado (los skeletons vivos son locales por página).

- [ ] **Paso 1:** Re-verificar en el momento (barato, blindado):

```bash
for t in PricingCta Skeleton auth_bg_new favicon-192 LIKE_WEBHOOK SWAP_WEBHOOK; do
  echo "== $t =="; grep -rn "$t" src public index.html manifest.json ../backend/tests 2>/dev/null | grep -v "Binary\|\.md" | grep -viv "comment"; done
# Esperado: solo self-refs / comments listados arriba
```

- [ ] **Paso 2:** Borrar archivos + editar vite.config/envs/comment de Home.
- [ ] **Paso 3:** `npm run build && npm test` verdes; `npm run build` → confirmar que el precache del SW bajó (~700KB menos si esos assets entraban al glob — auth_bg_new ya estaba globIgnored: la ganancia real es repo/deploy, no precache; favicon-192 sí sale del precache).
- [ ] **Paso 4:** Commit scoped SOLO de estos paths: `chore(dead-code): PricingCta + Skeleton + assets huerfanos + env vars muertas (-290 LOC, -709KB) [P2-DEAD-CODE-SAFE]`

**Verificación:** build + suite verdes; smoke de Home (sección pricing intacta — usa `Pricing.jsx`, no PricingCta) y Login (fondo CSS intacto).

---

### Task P2-5: ESLint a 0 warnings + gate estricto

**Files:**
- Modify: ~40 archivos con los 147 warnings — 85× localStorage raw → `safeLocalStorageGet/Set/Remove` (el wrapper ya existe: `src/utils/safeLocalStorage.js`), 15× directivas `eslint-disable` sin uso (borrarlas), 7× setState síncrono en effect (evaluar una por una: refactor o disable justificado con comment), 5× deps de hooks faltantes (fix con patrón `useLatestRef`/`useStableCallback` ya existentes en src/hooks), 1× ref en cleanup
- Modify: `package.json` (script lint → `eslint . --max-warnings 0`), `.github/workflows/ci.yml` (quitar el tope 147)

**Nota:** las 85 de localStorage son EXACTAMENTE el gap que el custom rule `[P2-FRONTEND-LOCALSTORAGE-LINT]` señala; muchas están en try/catch manual (robustez ya cubierta) — la migración las uniformiza y permite borrar los try/catch locales.

- [ ] **Paso 1:** Mecánicas primero: `npx eslint . --fix` (limpia las 15+ directivas muertas y algún autofixable) → commit 1.
- [ ] **Paso 2:** Migración localStorage por lotes de ~15 callsites (los archivos grandes: Plan.jsx, Dashboard.jsx, PendingPipelineRecovery.jsx…), suite verde entre lotes → commits scoped por lote.
- [ ] **Paso 3:** Los 7 setState-in-effect + 5 hook-deps: caso por caso con test si el fix cambia timing (los `fetchData` faltantes en deps suelen querer `useLatestRef`).
- [ ] **Paso 4:** `"lint": "eslint . --max-warnings 0"` + CI actualizado.
- [ ] **Paso 5:** Commit final: `chore(lint): 147→0 warnings + gate estricto [P2-LINT-ZERO]`

**Verificación:** `npm run lint` exit 0; CI verde.

---

### Task P2-6: Re-render surgery de Dashboard.jsx y History.jsx (memoización dirigida por profiling)

**Files:**
- Modify: `src/pages/Dashboard.jsx` (extraer `MealCard`/`DayColumn` de los maps `:6669` y `:7099` a componentes `React.memo` en `src/components/dashboard/`), `src/pages/History.jsx` (ídem para las cards de sus 25 maps → `src/components/history/`)
- Test: characterization tests de render antes de extraer (los snapshots de contenido existentes sirven de red)

**Evidencia:** 0 `React.memo` en pages; cada `setState` del monolito (greeting 60s, overlay 4s en regen, chunk-poll 30s, cambios de context) re-evalúa 8359 LOC de JSX. NO es problema de virtualización (listas acotadas) — es costo de re-render del monolito.

**Regla de oro:** extraer y memoizar SOLO los hot paths medidos; NO emprender el split total del archivo (los splits XL siguen gated por sus tests, deuda conocida).

- [ ] **Paso 1 (medir):** React DevTools Profiler en dev: grabar 60s de Dashboard idle (greeting tick + chunk poll) y una regen. Anotar ms/commit y qué subtrees re-renderizan. Éxito definido: −70% de tiempo de commit en ticks idle.
- [ ] **Paso 2:** Extraer `MealCard` (props: meal, índices, callbacks estables — envolver los callbacks inline con `useCallback`/`useStableCallback` para que memo no sea inútil) → `React.memo`. Ídem `DayColumn`.
- [ ] **Paso 3:** Re-medir con el profiler (mismo escenario). Documentar antes/después en el commit.
- [ ] **Paso 4:** Repetir 1-3 en History (HistoryCard).
- [ ] **Paso 5:** Suite verde (los tests de Dashboard/History existentes son la red) + smoke visual de ambas páginas en claro/oscuro.
- [ ] **Paso 6:** Commits por página: `perf(dashboard): MealCard/DayColumn memoizados (-X% commit time) [P2-DASH-MEMO]`

**Verificación:** números del profiler en el commit; cero cambios visuales (diff de screenshots).

---

### Task P2-7: Borrar ChatWidget.jsx (748 LOC) y Register.jsx (314 LOC) — coordinado cross-repo

**Files:**
- Delete: `src/components/dashboard/ChatWidget.jsx`, `src/pages/Register.jsx`
- Delete/retarget (frontend): `src/__tests__/P1_B_chatwidget_storage_corruption.test.jsx`; retarget `src/__tests__/utils/safeJSONParse.test.js` (hace readFileSync de ChatWidget → apuntarlo a un consumidor vivo de `safeJSONParse` o a fixture inline)
- Modify (backend, mismo día): `backend/tests/test_p2_a11y_logging_frontend_anchors.py` (anchors de ChatWidget → retarget a `HelpChatWidget.jsx`/`agent/MessageBubble.jsx`, que son los widgets vivos), `backend/tests/test_p2_new_localstorage_migration_debt.py` (quitar ChatWidget de la lista escaneada), `backend/tests/test_p3_lazy_markdown.py` (quitar ChatWidget de los consumers de LazyMarkdown), `backend/tests/test_p2_audit_6_auth_a11y.py` (retarget `_REGISTER_JSX` → `Login.jsx`, verificando que Login satisface los ≥4 pares htmlFor/id — si no, el assert se ajusta al conteo real de Login), `backend/tests/test_p3_prod_audit_6.py` (retarget min-8-char → `ResetPassword.jsx`, que es donde vive el campo password hoy; el login es OTP)

**Contexto:** ambos archivos llevan ≥2 audits confirmados con 0 imports de producción. `/register` rutea a `<Navigate to="/login">` sin importar Register. Lo ÚNICO que los mantiene vivos son tests que parsean su source. Los utils que Register importa (`checkLeakedPassword`, `firstPartySession`, `authErrors`) tienen otros consumidores — NO borrarlos. `Auth.module.css` la usa ResetPassword — NO borrarla.

- [ ] **Paso 1 (backend):** editar los 5 tests backend según arriba; correr `pytest backend/tests/test_p2_a11y_logging_frontend_anchors.py backend/tests/test_p2_new_localstorage_migration_debt.py backend/tests/test_p3_lazy_markdown.py backend/tests/test_p2_audit_6_auth_a11y.py backend/tests/test_p3_prod_audit_6.py -v` → verdes CONTRA el árbol frontend aún con los archivos (los retargets apuntan a archivos vivos, así que pasan antes y después del borrado).
- [ ] **Paso 2 (frontend):** borrar los 2 archivos + el test de chatwidget; retarget safeJSONParse.test.js; `npm test` verde.
- [ ] **Paso 3:** Re-correr los 5 tests backend contra el árbol sin los archivos → verdes.
- [ ] **Paso 4:** Commits el mismo día: backend (`test: retarget anchors de ChatWidget/Register a widgets vivos [P2-DEAD-CODE-XREPO]` + bump `_LAST_KNOWN_PFIX` si es política del repo backend para P-fixes) y frontend (`chore(dead-code): ChatWidget + Register (-1062 LOC) [P2-DEAD-CODE-XREPO]`). Deploy backend + frontend.

**Verificación:** ambas suites verdes en ambos repos; `/register` sigue redirigiendo a `/login`; el chat vivo (AgentPage + HelpChatWidget) intacto.

---

### Task P2-8: Migrar historyCaches/pantryCache a TanStack Query (deuda P2-1 heredada, −513 LOC)

**Files:**
- Delete (al final): `src/utils/historyCaches.js` (371 LOC), `src/utils/pantryCache.js` (142 LOC)
- Modify: consumidores en `History.jsx`, `Pantry.jsx`, `Dashboard.jsx` (+ los que salgan del grep) → `useQuery`/`queryClient.fetchQuery` con keys `[recurso, userId]`
- Rewrite: los 7 archivos de test que anclan los singletons (observar comportamiento — dedup/TTL/invalidación — en vez de internals)

**Contexto:** `quotaCache` ya migró con el patrón correcto (TTLs por callsite = `staleTime` en `fetchQuery` sobre la misma key — `src/utils/quotaCache.js:24-31`). Replicarlo. El clear PII en logout ya es estructural (`clearUserQueryCache()`). Proyecto green-to-green: CADA surface migrada mantiene su TTL actual documentado.

- [ ] **Paso 1:** Inventario: `grep -rn "historyCaches\|pantryCache" src --include="*.jsx" --include="*.js" | grep -v test` → mapa surface→TTL actual.
- [ ] **Paso 2:** Migrar UNA surface (la más simple de historyCaches) con su test reescrito → suite verde → commit. Repetir por surface (lotes pequeños, cada uno shippeable).
- [ ] **Paso 3:** Cuando queden 0 consumidores: borrar los 2 archivos + sus tests de internals; verificación de invalidación cross-page (History→visibilitychange, Recipes post-mutación, Pantry prefetch — invariante I4 del CLAUDE.md se preserva vía `queryClient.invalidateQueries`).
- [ ] **Paso 4:** Commit final: `refactor(cache): historyCaches+pantryCache → TanStack Query (-513 LOC) [P2-QUERY-MIGRATION]`

**Verificación:** suite verde; smoke: History con 2 tabs (invalidación), Pantry tras restock, cero fetch duplicado en Network tab al navegar History↔Dashboard.

---

### Task P2-9: CSP de Report-Only a enforced (ops coordinado, doc listo)

**Files:**
- Fuente: `docs/csp_enforcement_readiness.md` (checklist completo ya escrito; ignorar las secciones marcadas OBSOLETAS de vercel.json)
- Target: VPS nginx `/etc/nginx/snippets/mealfit-security.conf` + backend (colector de reportes)

- [ ] **Paso 1:** Wire del colector ANTES de enforcing: endpoint backend `POST /api/csp-report` (sink fire-and-forget con rate limit, patrón `_PDF_TELEMETRY_LIMITER`) + `report-uri`/`report-to` en la CSP Report-Only actual.
- [ ] **Paso 2:** Observar 1 semana de reportes en prod (query a la tabla/log del sink). Especial atención a PayPal SDK (`unsafe-eval`, dominios no listados) — es EL riesgo de ingresos documentado.
- [ ] **Paso 3:** Smoke-test de checkout PayPal completo en sandbox CON la CSP candidata en enforced (browser local con header override o staging).
- [ ] **Paso 4:** Flip a `Content-Security-Policy` (enforced) en el snippet nginx; mantener Report-Only en paralelo 1 semana más (doble header) para detectar drift residual.
- [ ] **Paso 5:** Verificar: `curl -sI https://app.mealfitrd.com | grep -i content-security` → enforced presente; checkout sandbox OK post-flip.

**Verificación:** 0 violations críticas en la semana de observación post-flip; pagos sandbox funcionando.

---

# P3 — Bajos

### Task P3-1: Batch de micro-fixes de hardening/perf (6 fixes de una sesión)

**Files & fixes (cada uno con su mini-test donde aplique):**

1. **`src/context/HeroCtaContext.jsx:26`** — memoizar el value: `const value = useMemo(() => ({ heroCtaVisible, setHeroCtaVisible }), [heroCtaVisible]);` (único provider sin memo).
2. **`src/pages/Plan.jsx:1356-1366`** — mover el `setInterval` del countdown a un `useEffect` con `clearInterval` en cleanup (hoy se auto-limpia por flag con ventana ≤1s post-unmount).
3. **`src/custom-sw.js:136-140`** — pin same-origin en `notificationclick`: si `new URL(data.url, self.location.origin).origin !== self.location.origin` → usar `'/'`.
4. **`src/main.jsx:174-200`** — endurecer scrub Sentry: subir depth 3→6 y añadir redacción value-based (regex email/JWT en strings de `extra`/breadcrumbs).
5. **`src/components/dashboard/PaymentModal.jsx`** — guard anti double-submit: ref `inFlightRef` que ignora reentradas en `onApprove`/`handlePaymentSuccess` (defensa-en-profundidad sobre el SDK).
6. **Consolidar `escapeHtml`**: dejar UNA impl en `src/utils/escapeHtml.js`; `shoppingHelpers.js:132` re-exporta desde ahí y `Dashboard.jsx` importa la canónica. Dos impls de una defensa XSS = drift risk. Test: mismo output para `&<>"'`.

- [ ] Implementar 1-6 con suite verde entre medias; commit único scoped: `chore(hardening): 6 micro-fixes (memo, cleanup, SW origin-pin, sentry scrub, pay guard, escapeHtml SSOT) [P3-MICRO-BATCH]`

---

### Task P3-2: Higiene de localStorage (sweep por-plan + fix restock_cache muerta)

**Files:**
- Modify: `src/context/AssessmentContext.jsx` (boot sweep), `src/pages/Dashboard.jsx:5295-5299` (lectura de cache que nadie escribe)

**Evidencia:** ~12 flags por-plan (`dismissed`/`backfilled`, keyeadas por `_planMicroSig` que cambia en cada regen) se acumulan sin TTL ni limpieza en user-switch (~10-20KB/100 planes — bloat, no cuota). Y `mealfit_restock_cache_*` se LEE (`:5299`) pero NUNCA se escribe → la restauración de `is_restocked` es rama muerta (un plan restocked puede re-mostrar el nudge de nevera tras recalc).

- [ ] **Paso 1:** Decidir la rama muerta: o escribirla (al confirmar restock, persistir la key) o borrar la lectura. Leer el flujo de `/restock` en Dashboard para ver cuál era la intención; si el backend ya persiste `is_restocked` de forma confiable, borrar la lectura (menos estado local).
- [ ] **Paso 2:** Sweep en boot (una vez por sesión): `Object.keys(localStorage)` filtrando los prefijos de flags por-plan conocidos; conservar solo las 3 firmas de plan más recientes; envolver en try/catch + `requestIdleCallback`.
- [ ] **Paso 3:** Test del sweep (jsdom localStorage sembrada con 10 firmas → quedan 3). Commit: `chore(storage): sweep flags por-plan + fix rama muerta restock_cache [P3-LS-HYGIENE]`

---

### Task P3-3: Cifrado de datos sensibles de invitados (o aceptación documentada)

**Files:** `src/config/secureFormStorage.js:76,103-114`

**Evidencia:** usuarios autenticados → AES-GCM; invitados → `sessionStorage` en claro (alergias, condiciones, medicaciones). Session-scoped y decisión documentada, pero inconsistente con el path autenticado.

- [ ] **Opción A (preferida, ~1h):** clave AES efímera generada en memoria por sesión de invitado (`crypto.getRandomValues` → `importKey`, vive solo en el módulo): mismo cifrado, cero backend. Un refresh pierde la clave → el wizard invitado re-pide sensibles (aceptable: los invitados pierden el form al cerrar tab hoy igual). ⚠️ Verificar primero si HOY el flujo invitado sobrevive refresh — si sí, esta opción lo degrada y hay que guardar la clave en sessionStorage… lo que anula el cifrado → caer a Opción B.
- [ ] **Opción B:** aceptar formalmente: comment-anchor en el código + entrada en la sección de decisiones del CLAUDE.md/memoria.
- [ ] Test según opción; commit scoped.

---

### Task P3-4: Token admin dedicado para Supermercado (dejar de reutilizar CRON_SECRET) — coordinado backend

**Files:** `src/pages/SupermarketPage.jsx:17,159-162,491-493` + `backend/routers/supermarket.py`

**Evidencia:** el gate admin de `/supermercado` usa el `CRON_SECRET` del backend pegado por el operador en sessionStorage — un secreto de alto valor (auth de crons) expuesto a XSS mientras está desbloqueado.

- [ ] **Backend:** aceptar un segundo token `SUPERMARKET_ADMIN_TOKEN` (env) en `_verify_admin_token` del router supermarket (solo ese router); mantener CRON_SECRET válido para no romper al operador (deprecación suave).
- [ ] **Frontend:** sin cambios de código (el operador pega el token nuevo); actualizar el placeholder/copy del gate.
- [ ] Test backend del router con ambos tokens; commit coordinado.

---

### Task P3-5: Virtualización/paginación de listas grandes en Pantry e History (gated por profiling)

**Files:** `src/pages/Pantry.jsx:1856-1865`, `src/pages/History.jsx:1746-1779`, umbral en `src/components/agent/virtualizeThreshold.js` (patrón existente)

**Evidencia:** react-virtuoso instalado pero solo usado en el chat (umbral 100). Pantry renderiza TODOS los items (con steppers + BrandSelect por fila); History todas las cards. Hoy las listas están acotadas (~15 planes, ~50 items típicos) — es previsión de escala, no bug actual.

- [ ] **Paso 1:** Perfilar con datos sintéticos (200 items pantry / 100 planes) en un Android medio (o CPU 6x throttle). Si el render inicial <300ms y el scroll no jankea → CERRAR como "no necesario aún" con los números documentados.
- [ ] **Paso 2 (solo si falla el paso 1):** Virtuoso con umbral (>60 items) en Pantry (respetando agrupación por categoría → `GroupedVirtuoso`) y History.
- [ ] Commit según resultado.

---

### Task P3-6: Quitar `prop-types` (no-op en React 19, 24 archivos)

**Files:** 24 archivos con `import PropTypes from 'prop-types'` + sus bloques `X.propTypes = {…}`; `package.json` (quitar dep)

**Nota:** alineado a la migración TS Fase 0 (los tipos van a TS, no a propTypes). 2 de los 24 mueren antes en P2-4/P2-7.

- [ ] Quitar imports + bloques por lotes mecánicos; `npm uninstall prop-types`; suite + build verdes; commit: `chore: remove prop-types (no-op React 19, 24 archivos) [P3-PROPTYPES-OUT]`

---

### Task P3-7: Permitir copiar la lista de compras (decisión owner sobre `user-select: none` global)

**Files:** `src/index.css:607-608` (global) + `:871-874` (whitelist actual: chat/inputs)

**Evidencia:** `user-select: none` global (feel nativo, decisión) impide copiar la lista de compras en móvil — fricción real reportada en el audit v2 y aún viva.

- [ ] **Paso 1:** Confirmar con el owner: ¿la lista de compras (y quizá recetas) debe ser copiable?
- [ ] **Paso 2 (si sí):** añadir clase `.selectable { user-select: text; -webkit-user-select: text; }` y aplicarla al contenedor de la lista en Dashboard (y recetas si aplica). Smoke en iOS/Android.
- [ ] Commit: `fix(ux): lista de compras copiable (.selectable) [P3-COPY-SHOPPING]`

---

### Task P3-8: Huérfanos que requieren nod del owner (icon 180, Logo.jsx WIP)

**Files:** `public/apple-touch-icon-180.png` (23.8KB), `src/components/common/Logo.jsx` (56 LOC, 1 día de antigüedad) + `public/mealfit-mark-dark.png` (47.7KB)

**Evidencia:** `-180.png` tiene 0 referencias reales (index.html usa `-180-v2.png`; el manifest usa `-192`/512) pero un comment en index.html:162 dice que se conserva "como fallback" — el comment contradice la realidad. `Logo.jsx` tiene 0 imports pero se creó AYER (commit "Marca: isotipo + wordmark") — casi seguro WIP del owner pendiente de cablear.

- [ ] Preguntar al owner ambos en un mensaje: (a) ¿borro `-180.png` y corrijo el comment?, (b) ¿`Logo.jsx` va a cablearse o lo borro?
- [ ] Ejecutar según respuesta; commit scoped.

---

### Task P3-9: Trim adicional del precache del SW (revisión de filtros por hostname)

**Files:** `src/custom-sw.js:16-24` (regex `_APP_ONLY_CHUNKS`/`_MARKETING_ONLY_CHUNKS`)

**Evidencia:** precache actual 94 entries / 3.2MB (pre-filtro). Los filtros por hostname existen; páginas nuevas desde su creación (News, Supermarket, Engine, Pricing, detail-pages, LegalPages 70KB) podrían no estar en los regex → el app-host precachea chunks de marketing y viceversa.

- [ ] **Paso 1:** Auditar los regex contra la lista real de chunks del build (`ls dist/assets/*.js`); anotar cuáles caen en cada bucket hoy.
- [ ] **Paso 2:** Añadir los que falten al bucket correcto (LegalPages/News/Supermarket/Engine/Pricing/HowItWorks/Features/Precision → marketing-only; History/Pantry/Recipes/Settings/AgentPage/Dashboard → app-only). Regla del repo: si se renombra una página, revisar estos regex.
- [ ] **Paso 3:** `npm run build` + probar install del SW en ambos hosts (DevTools → Application → Cache Storage) → verificar los KB precacheados por host. Commit: `perf(sw): filtros hostname al dia — precache menor por host [P3-SW-PRECACHE-TRIM]`

---

## Fuera de alcance (decisiones ya tomadas — NO son gaps)

- **i18n**: es-DO hardcoded permanente (decisión de producto, test ancla `test_p3_i18n_deferred.py`).
- **JWT espejo en localStorage** (`mealfit_mf_session`): tradeoff arquitectónico documentado por iOS PWA standalone; el header custom es CSRF-inmune. Aceptado.
- **AuthBackground.jsx**: huérfano en código pero export curado de design-sync. No borrar sin decisión de diseño.
- **Splits XL de Dashboard/History/Settings** (más allá de P2-6): gated por sus tests; sin ROI funcional hoy.
- **MotionConfig en DashboardLayout** (no en App): deliberado — framer fuera del critical path.
- **Zoom-lock del viewport**: confirmado con owner (trade-off WCAG aceptado).
- **Polling→refetchInterval** (P2-2 del roadmap viejo): superseded — el audit verificó que TODOS los polls tienen visibility-guard + cleanup + AbortController. Sin valor incremental.

## Superficies verificadas OK (no re-auditar sin cambio de código)

XSS/PDF (escapado universal), react-markdown+rehypeSanitize, crypto del wizard (AES-GCM/HKDF real), teardown PII en logout, target=_blank (todos con noopener), postMessage (sin listeners cross-origin), VITE_* (sin secretos), SW runtime (deny /api, NetworkFirst+no-store navegación), rutas lazy al 100%, framer-motion fuera de eager, polls con visibility+cleanup, single-flight de generación + recovery multi-capa (excepto watchdog P1-4), PayPal limbo-safe, optimistic updates con rollback, TZ/planWindow defensivo, deep-links null-safe, multi-tab (storage listeners + guard cross-plan), typeahead in-memory.

## Orden de ejecución recomendado

1. **P1-1 → P1-2** (baseline verde → CI): todo lo demás gatea sobre esto.
2. **P1-3** (deps) y **P1-6** (nginx): independientes, rápidos.
3. **P1-4** (SSE watchdog) y **P1-5** (PayPal verify-first): el corazón del golden path y del dinero.
4. **P2-4** (dead code seguro) y **P2-5** (lint 0): barren ruido antes de los refactors.
5. **P2-1** (neon lazy), **P2-2** (debounce), **P2-3** (401): perf/robustez de alto valor.
6. **P2-6** (memo), **P2-7** (dead code x-repo), **P2-8** (query migration), **P2-9** (CSP).
7. **P3-1…P3-9** en cualquier orden (P3-7/P3-8 requieren respuesta del owner — preguntarlas temprano en paralelo).

**Criterio de cierre ("100% production-ready"):** P1+P2+P3 implementados o cerrados con decisión documentada del owner; CI verde con lint 0 warnings, suite 100% pass, audit-gate OK; métricas objetivo: critical path ≤ ~180KB gzip (−89KB de P2-1), 0 vulns high+ no-triaged en prod deps, 0 código muerto conocido.
