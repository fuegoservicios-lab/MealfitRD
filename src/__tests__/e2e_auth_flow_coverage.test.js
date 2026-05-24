// [P0-PROD-AUDIT-1 · 2026-05-23] Guard que el E2E spec
// `e2e/auth_flow.spec.js` existe + cubre los escenarios canónicos.
//
// Gap original (audit production-readiness 2026-05-23, F-P0-2):
//   El único E2E previo (`e2e/golden_path.spec.js`) cubría solo la home
//   pública. El flow crítico de revenue (signup → assessment → plan →
//   PayPal) NO tenía cobertura — regresiones en login/protected routes
//   solo se descubrían post-deploy via reports de usuario.
//
// Fix:
//   - Nuevo `e2e/auth_flow.spec.js` con coverage:
//     - /login renderiza form con email/password/submit.
//     - /register renderiza form.
//     - 7 protected routes redirigen a /login sin auth.
//     - Toggle de reset password en /login.
//     - Link a /register desde /login.
//     - Navegación SPA (no full reload) entre login ↔ register.
//
// Limitación documentada:
//   El spec NO cubre login con credenciales reales (requiere staging
//   Supabase). El follow-up `P1-E2E-FULL-AUTH-FLOW` extiende cuando
//   exista entorno staging.
//
// Por qué un test del spec (no solo el spec en sí):
//   Tests E2E pueden borrarse "por flakiness" sin reemplazo. Sin enforcement
//   en CI parser-based, no hay forma de garantizar que el coverage mínimo
//   persista. Este test ancla la existencia + lista de tests críticos.
//
// Cobertura:
//   A) Spec file existe.
//   B) Spec declara los 7 protected routes (lista canónica del repo).
//   C) Spec valida que /login tiene form + email + password.
//   D) Spec valida que /dashboard sin auth redirige a /login (caso
//      más visible — ProtectedRoute).
//   E) Anchor `P0-PROD-AUDIT-1` o `F-P0-2` presente.
//
// Tooltip-anchor: P0-PROD-AUDIT-1-E2E-AUTH-COVERAGE | audit 2026-05-23.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _SPEC_PATH = join(__dirname, '..', '..', 'e2e', 'auth_flow.spec.js');

describe('P0-PROD-AUDIT-1: E2E auth flow spec existe + cubre mínimo', () => {
    it('A) e2e/auth_flow.spec.js existe', () => {
        expect(
            existsSync(_SPEC_PATH),
            `Spec ausente en ${_SPEC_PATH}. Cierre del gap F-P0-2 perdido. ` +
            `Restaurar desde git history (commit P0-PROD-AUDIT-1).`,
        ).toBe(true);
    });

    it('B) spec declara los 7 protected routes canónicos', () => {
        const src = readFileSync(_SPEC_PATH, 'utf8');
        // Rutas canónicas del frontend (ProtectedRoute en App.jsx).
        const requiredRoutes = [
            '/dashboard',
            '/dashboard/pantry',
            '/dashboard/recipes',
            '/dashboard/settings',
            '/history',
            '/assessment',
            '/plan',
        ];
        const missing = requiredRoutes.filter((r) => !src.includes(`'${r}'`));
        expect(
            missing,
            `Spec NO declara routes canónicas: ${missing.join(', ')}. ` +
            `Si añadiste/quitaste protected routes en App.jsx, actualizar ` +
            `PROTECTED_ROUTES en auth_flow.spec.js Y este test.`,
        ).toHaveLength(0);
    });

    it('C) spec valida que /login renderiza form completo', () => {
        const src = readFileSync(_SPEC_PATH, 'utf8');
        // Heurística: presence de selectors críticos del form.
        const requiredAssertions = [
            // Selectores del form (email, password, submit).
            'input[type="email"]',
            'input[type="password"]',
            'button[type="submit"]',
        ];
        const missing = requiredAssertions.filter((s) => !src.includes(s));
        expect(
            missing,
            `Spec /login no valida selectors críticos: ${missing.join(', ')}. ` +
            `Si la UI cambió radicalmente, actualizar el spec O este test.`,
        ).toHaveLength(0);
    });

    it('D) spec valida redirect protected → /login', () => {
        const src = readFileSync(_SPEC_PATH, 'utf8');
        // Heurística: `waitForURL` + `/login` o `Navigate to="/login"`.
        const hasRedirectAssertion =
            /waitForURL\s*\(\s*['"`][^'"`]*\/login/.test(src) ||
            /toContain\s*\(\s*['"`]\/login/.test(src);
        expect(
            hasRedirectAssertion,
            `Spec NO valida que protected routes redirigen a /login. ` +
            `Este es el guard de seguridad más crítico — sin el assert, ` +
            `un bug en ProtectedRoute (e.g. condición invertida) pasaría ` +
            `silencioso. Restaurar la aserción.`,
        ).toBe(true);
    });

    it('E) anchor P0-PROD-AUDIT-1 o F-P0-2 presente', () => {
        const src = readFileSync(_SPEC_PATH, 'utf8');
        const hasAnchor = src.includes('P0-PROD-AUDIT-1') || src.includes('F-P0-2');
        expect(
            hasAnchor,
            'Spec perdió el anchor `P0-PROD-AUDIT-1` o `F-P0-2`. Sin ' +
            'breadcrumb operacional, el siguiente mantenedor no puede ' +
            'rastrear el origen del spec ni los gaps que cierra.',
        ).toBe(true);
    });

    it('F) spec documenta scope explícitamente fuera (full auth flow)', () => {
        // El gap F-P0-2 menciona login → assessment → plan → PayPal. Si
        // el spec NO documenta que esa parte está fuera de scope (por
        // requerir staging Supabase), un futuro mantenedor podría asumir
        // que ESTÁ cubierto. Anclar la limitación.
        const src = readFileSync(_SPEC_PATH, 'utf8');
        const hasScopeNote =
            /staging Supabase|staging|FUERA|P1-E2E-FULL-AUTH-FLOW/.test(src);
        expect(
            hasScopeNote,
            'Spec no documenta que el flow completo (signup → assessment → ' +
            'plan → PayPal) está FUERA DE SCOPE pendiente de staging Supabase. ' +
            'Restaurar la nota — el follow-up es real y necesita visibilidad.',
        ).toBe(true);
    });
});
