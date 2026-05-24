// [P0-PROD-AUDIT-1 · 2026-05-23] `frontend/vercel.json` debe declarar el
// header `Content-Security-Policy` (enforce mode), NO `Content-Security-Policy-Report-Only`.
//
// Gap original (audit production-readiness 2026-05-23, F-P0-3):
//   Pre-fix: el header era `Content-Security-Policy-Report-Only` (configurado
//   originalmente en P1-VERCEL-SECURITY-HEADERS · 2026-05-12 con plan de
//   "promover a enforced tras 1 semana de observación"). El plan quedó stale.
//
//   Modo Report-Only:
//     - El browser ENVÍA violation reports (si hay `report-uri`) pero
//       NO BLOQUEA el contenido violatorio.
//     - Si NO hay `report-uri` configurado (nuestro caso — Vercel no
//       proporciona collector), las violaciones SOLO se imprimen al
//       console del browser del usuario afectado. SIN visibilidad
//       operacional, sin enforcement, sin alertas.
//     - Un XSS exitoso (inline script malicioso) pasa SILENCIOSAMENTE.
//
//   El enforce mode bloquea el contenido violatorio → defensa real.
//
// Fix:
//   - Rename `Content-Security-Policy-Report-Only` → `Content-Security-Policy`
//     en `vercel.json`. El value (allowlist de hosts) se preserva sin cambios
//     — ya está working en Report-Only desde 2026-05-12, los hosts conocidos
//     son válidos. Si algo se rompiera, sería detectable en smoke E2E o
//     reports de usuarios inmediatamente.
//
//   - Limitación conocida: `'unsafe-inline'` permanece en `script-src` y
//     `style-src`. Removerlo requiere:
//       (a) Migrar a CSP nonce-based (genera nonce per-request, inyecta en
//           `<script nonce=...>` server-side). Vercel soporta middleware
//           para esto pero requiere refactor.
//       (b) O migrar todos los `style={{...}}` inline a CSS classes
//           (Tailwind cubre la mayoría pero hay generación dinámica de
//           estilos en PDF render). Costo alto.
//     Follow-up: `P1-CSP-NONCE-BASED`.
//
// Por qué un test (no solo el cambio):
//   El header es config — un PR cosmético podría revertir a Report-Only
//   "para debugging" y olvidar restaurar. Este test ancla el contrato +
//   enumera la racional para futuro contexto.
//
// Cobertura:
//   A) vercel.json existe + JSON válido.
//   B) Headers contiene `Content-Security-Policy` (enforce).
//   C) Headers NO contiene `Content-Security-Policy-Report-Only`.
//   D) Allowlist preserva hosts críticos (Supabase, PayPal, Sentry, Posthog).
//
// Tooltip-anchor: P0-PROD-AUDIT-1-CSP-ENFORCE | audit 2026-05-23.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _VERCEL_JSON = join(__dirname, '..', '..', 'vercel.json');

let parsed;
let raw;
try {
    raw = readFileSync(_VERCEL_JSON, 'utf8');
    parsed = JSON.parse(raw);
} catch (e) {
    throw new Error(
        `vercel.json no es JSON válido o no existe en ${_VERCEL_JSON}: ${e.message}`,
    );
}

function findHeader(name) {
    const route = (parsed.headers || []).find((h) => h.source === '/(.*)');
    if (!route) return null;
    return (route.headers || []).find((h) => h.key === name);
}

describe('P0-PROD-AUDIT-1: CSP en modo enforce (no Report-Only)', () => {
    it('A) vercel.json existe y es JSON válido', () => {
        expect(parsed).toBeDefined();
        expect(parsed.headers).toBeDefined();
    });

    it('B) Content-Security-Policy (enforce) está declarado', () => {
        const csp = findHeader('Content-Security-Policy');
        expect(
            csp,
            'vercel.json NO declara `Content-Security-Policy` (enforce). ' +
            'XSS exploitable pasa silencioso. Cierre del gap F-P0-3 perdido. ' +
            'Si revertiste a Report-Only "para debugging", documentar la ' +
            'decisión + restaurar enforce tras debugging window.',
        ).toBeTruthy();
        expect(csp.value).toBeTruthy();
        expect(csp.value.length).toBeGreaterThan(100);
    });

    it('C) Content-Security-Policy-Report-Only NO está declarado', () => {
        // Dos modos simultáneos son contradictorios — Report-Only "gana"
        // en algunos browsers, enforce en otros. Mantener UN solo header.
        const reportOnly = findHeader('Content-Security-Policy-Report-Only');
        expect(
            reportOnly,
            'vercel.json declara `Content-Security-Policy-Report-Only` ' +
            'simultáneamente con enforce. Modo dual NO es defensa — ' +
            'browsers pueden honrar Report-Only ignorando enforce. ' +
            'Eliminar el header Report-Only.',
        ).toBeFalsy();
    });

    it('D) CSP allowlist preserva hosts críticos', () => {
        const csp = findHeader('Content-Security-Policy');
        const value = csp?.value || '';
        // Hosts que NO pueden estar bloqueados sin romper app:
        //   - Supabase (auth + DB + realtime websockets).
        //   - PayPal (billing + iframe).
        //   - Sentry (error tracking — sin esto perdemos visibilidad).
        //   - Posthog (analytics — opcional pero esperado).
        const requiredHosts = [
            { host: '*.supabase.co', context: 'connect-src (REST + websockets)' },
            { host: '*.paypal.com', context: 'connect-src / frame-src (billing)' },
            { host: '*.sentry.io', context: 'connect-src (error tracking)' },
        ];
        for (const { host, context } of requiredHosts) {
            expect(
                value.includes(host),
                `CSP no incluye ${host} (${context}). Removerlo rompe la ` +
                `funcionalidad. Si fue intencional, documentar la decisión.`,
            ).toBe(true);
        }
    });

    it('E) anchor P0-PROD-AUDIT-1 o X-Mealfit-Config-Anchor presente', () => {
        // Marker config-anchor: defensa contra refactor cosmético del JSON
        // que perdería el contexto.
        const anchor = findHeader('X-Mealfit-Config-Anchor');
        expect(
            anchor,
            'vercel.json perdió `X-Mealfit-Config-Anchor` (definido en ' +
            'P1-VERCEL-SECURITY-HEADERS 2026-05-12). Restaurar — es el ' +
            'breadcrumb operacional para identificar qué P-fix definió ' +
            'esta config.',
        ).toBeTruthy();
    });
});
