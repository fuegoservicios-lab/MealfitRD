# CSP Enforcement Readiness — listo para activar tras probar PayPal

> **Estado actual: CSP en `Content-Security-Policy-Report-Only` (NO enforced).**
> Este doc contiene TODO lo necesario para promover a enforced de forma segura.
> **NO actives nada de esto sin antes hacer el smoke-test de PayPal en staging**
> (el SDK de PayPal puede inyectar inline/eval no listado → romper el checkout).
>
> Origen: audit frontend velocidad+seguridad 2026-05-31 (gaps `d4-csp-report-only-not-enforced`
> + `d4-csp-no-report-collection`). Marker: `P1-CSP-ENFORCE-READY`.

---

## Por qué no se activó automáticamente

1. **Riesgo PayPal (ingresos)**: la CSP permite `script-src 'unsafe-inline'` pero NO `'unsafe-eval'`. Si el SDK de PayPal necesita `eval` o cargar desde un dominio no listado, enforcing rompe el checkout silenciosamente. Sin staging no se puede validar.
2. **Sin colector de reportes**: la CSP Report-Only actual no tiene `report-uri`/`report-to`, así que las violaciones se ven solo en la consola del navegador del usuario — no llegan a ningún backend. **Hay que wire el colector ANTES de enforcing** para poder observar 1 semana.
3. **Contrato de test**: `backend/tests/test_p1_vercel_security_headers.py::test_csp_starts_as_report_only` exige que siga Report-Only. Promover requiere actualizar ese test (ver §4).

---

## Plan de promoción (orden obligatorio)

### Paso 0 — Wire el colector de reportes (seguro, hazlo YA si quieres)
Elige UNA opción y añade `report-uri` + `report-to` a la CSP Report-Only **actual** (sigue siendo Report-Only → 0 riesgo PayPal, solo empieza a recoger violaciones):

**Opción A — Sentry (recomendada, ya está whitelisted en connect-src):**
Deriva el endpoint del `VITE_SENTRY_DSN`. Un DSN tiene forma
`https://<PUBLIC_KEY>@o<ORG_ID>.ingest.sentry.io/<PROJECT_ID>`. El endpoint CSP es:
```
https://o<ORG_ID>.ingest.sentry.io/api/<PROJECT_ID>/security/?sentry_key=<PUBLIC_KEY>
```
Añade al final del string CSP (antes de `upgrade-insecure-requests` da igual):
```
; report-uri https://o<ORG_ID>.ingest.sentry.io/api/<PROJECT_ID>/security/?sentry_key=<PUBLIC_KEY>
```

**Opción B — Backend propio** (si prefieres no depender de Sentry para CSP):
Crea `POST /api/csp-report` en FastAPI (loguea el body `application/csp-report`), añádelo a `connect-src` de la CSP, y usa `; report-uri /api/csp-report`. (Esto SÍ es cambio backend → bumpea `_LAST_KNOWN_PFIX`.)

**Opción C — report-uri.com** (gratis, dashboard externo): registra, copia tu URL, `; report-uri https://<tu-id>.report-uri.com/r/d/csp/reportOnly`.

> Modern `report-to`: además del `report-uri` (legacy, amplio soporte), puedes añadir un header `Reporting-Endpoints: csp-endpoint="<misma-url>"` + `; report-to csp-endpoint` en la CSP. Mantén AMBOS durante la transición.

### Paso 1 — Observa 1 semana
Con el colector activo y CSP aún Report-Only, revisa las violaciones reportadas. **Cero violaciones de los flujos core (login, assessment, generación de plan, dashboard, PDF, y sobre todo el checkout PayPal) = listo para enforcing.** Si aparece una violación legítima (p.ej. un dominio de PayPal/Supabase no listado), añádelo a la whitelist y reinicia la observación.

### Paso 2 — Smoke-test PayPal en staging
Despliega la versión enforced (§3) en un entorno de staging y completa un checkout PayPal real (sandbox) de principio a fin. Verifica en DevTools → Console que NO hay `Refused to ... because it violates the following Content Security Policy directive`. Si PayPal rompe:
- Si es por `eval`: PayPal necesita `'unsafe-eval'` → **NO enforces** sin antes evaluar el trade-off (debilita mucho la CSP). Considera mantener Report-Only.
- Si es por un dominio: añádelo a `script-src`/`frame-src`/`connect-src` y re-testea.

### Paso 3 — Activa enforcing (§3) + actualiza el test (§4) en el MISMO commit.

### Rollback (sin redeploy de código)
Revertir `Content-Security-Policy` → `Content-Security-Policy-Report-Only` en `vercel.json` y re-deploy de Vercel. Reversible en <2 min.

---

## §3 — `vercel.json` ENFORCED (copy-paste ready)

Cambios vs el actual: (1) la KEY del header CSP pasa de `Content-Security-Policy-Report-Only` → `Content-Security-Policy`; (2) se añade `report-uri` (rellena tu endpoint del Paso 0). El resto del value NO cambia (mismos hosts, mismo `unsafe-inline` para minimizar breakage en el primer enforce).

```json
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://*.paypal.com https://www.paypalobjects.com https://*.posthog.com https://*.sentry.io; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.sentry.io https://api-m.paypal.com https://*.paypal.com https://www.google-analytics.com https://*.posthog.com https://api.pwnedpasswords.com; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'self' https://www.paypal.com https://*.paypal.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; report-uri <TU_ENDPOINT_DEL_PASO_0>"
}
```

### (Opcional, Fase 2 — endurecimiento máximo: quitar `'unsafe-inline'` de scripts)
Solo hay 2 scripts inline en `index.html` (el boot de tema ~líneas 23-35 y el JSON-LD ~70-83). PayPal/Sentry/Supabase cargan como scripts EXTERNOS (no inline). Para quitar `'unsafe-inline'` de `script-src` sin romper esos 2 inline:
1. Calcula el hash SHA-256 de cada script inline (contenido EXACTO entre `<script>` y `</script>`, sin las tags):
   `cat script.js | openssl dgst -sha256 -binary | openssl base64`
2. Reemplaza `'unsafe-inline'` en `script-src` por `'sha256-<hash1>' 'sha256-<hash2>'`.
   ⚠️ `style-src 'unsafe-inline'` DEBE quedarse (React usa `style={{}}` inline por todos lados — no hasheable).
3. Cualquier edición futura a esos scripts inline rompe el hash → re-calcular. Por eso es Fase 2 (mantenimiento extra), no el primer enforce.

---

## §4 — Cambios al test (en el mismo commit que enforces)

`backend/tests/test_p1_vercel_security_headers.py`:

1. **`test_csp_starts_as_report_only`** (línea ~121): el comentario ya lo anticipa ("Este assert se invierte cuando se promueva"). Reemplaza el cuerpo por la versión enforced — assert que existe `Content-Security-Policy` (enforced) y NO `Content-Security-Policy-Report-Only`. Renombra a `test_csp_enforced`.
2. **`test_csp_whitelists_critical_hosts`** (línea ~144): cambia `csp = h["Content-Security-Policy-Report-Only"]` → `csp = h["Content-Security-Policy"]`.
3. Añade un assert nuevo: `report-uri` presente en el value de la CSP (ancla el colector del Paso 0).
4. **CLAUDE.md** (`### Vercel security headers`): actualiza la línea "CSP arranca Report-Only; promover a enforced tras 1 semana" → "CSP enforced desde <fecha>; report-uri → <sink>".

---

## Checklist de activación
- [ ] Paso 0: colector wired, CSP Report-Only sigue activa, deploy.
- [ ] Paso 1: 1 semana, 0 violaciones core (incl. PayPal).
- [ ] Paso 2: checkout PayPal sandbox OK end-to-end en staging con la CSP enforced.
- [ ] Paso 3: `vercel.json` enforced (§3) + test actualizado (§4) + CLAUDE.md en un commit.
- [ ] Post-deploy: 1 checkout PayPal real de prueba en prod; rollback listo si falla.
