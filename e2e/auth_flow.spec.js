// @ts-check
import { test, expect } from '@playwright/test';

/**
 * [P0-PROD-AUDIT-1 · 2026-05-23] E2E del flow de autenticación y protección
 * de rutas. Cierra el gap F-P0-2 del audit production-readiness 2026-05-23:
 * "E2E solo cubre home pública — no hay test autenticado de login →
 * assessment → generación de plan → pago PayPal. El happy path crítico no
 * está protegido".
 *
 * Scope INTENCIONAL (qué SÍ cubre):
 *   1. Página /login renderiza el formulario con email/password/submit.
 *   2. Página /register renderiza el formulario.
 *   3. Acceso a /dashboard sin auth → redirect a /login (ProtectedRoute).
 *   4. Acceso a /history sin auth → redirect a /login.
 *   5. Acceso a /assessment sin auth → redirect a /login.
 *   6. Hay link entre /login ↔ /register (UX gate de captación).
 *   7. Reset password mode toggle funciona en /login.
 *   8. NO hay errores JS de hydration en ninguna ruta de auth.
 *
 * Scope EXPLÍCITAMENTE FUERA (requiere staging Supabase aislado):
 *   - Login con credenciales reales → dashboard rendered.
 *   - Assessment form completion → plan generation E2E.
 *   - PayPal sandbox payment flow.
 *   - Logout via UI menu.
 *
 * Estos requieren:
 *   - Project Supabase de staging con usuario de test creado.
 *   - Backend FastAPI corriendo (staging) o mock-server complejo.
 *   - PayPal sandbox credentials + plan IDs de staging.
 *   - Env vars en CI (`PLAYWRIGHT_TEST_USER_EMAIL`,
 *     `PLAYWRIGHT_TEST_USER_PASSWORD`, etc.).
 *
 * Follow-up `P1-E2E-FULL-AUTH-FLOW`:
 *   Cuando exista entorno staging, extender este spec con:
 *     - Real Supabase signInWithPassword (con test user creado on-demand
 *       via supabase admin client + cleanup post-test).
 *     - Assessment completion → background pipeline observation.
 *     - PayPal Sandbox checkout flow.
 *
 * Tooltip-anchor: P0-PROD-AUDIT-1-E2E-AUTH | audit 2026-05-23.
 */

const PROTECTED_ROUTES = [
    { path: '/dashboard', label: 'Dashboard principal' },
    { path: '/dashboard/pantry', label: 'Despensa' },
    { path: '/dashboard/recipes', label: 'Recetas' },
    { path: '/dashboard/settings', label: 'Configuración' },
    { path: '/history', label: 'Historial de planes' },
    { path: '/assessment', label: 'Formulario de evaluación' },
    { path: '/plan', label: 'Vista del plan generado' },
];

test.describe('Auth flow + protección de rutas', () => {
    test.beforeEach(async ({ context }) => {
        // Garantizar storage limpia per-test. Sin esto, los tests podrían
        // verse contaminados por sessions cacheadas de un run anterior.
        await context.clearCookies();
        await context.clearPermissions();
    });

    test('/login renderiza formulario con email/password/submit', async ({ page }) => {
        const consoleErrors = [];
        page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
        });

        await page.goto('/login');
        await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });

        // Form structure — email input.
        const emailInput = page.locator('input[type="email"]').first();
        await expect(emailInput, 'campo de email NO renderiza').toBeVisible();

        // Form structure — password input.
        const passwordInput = page.locator('input[type="password"]').first();
        await expect(passwordInput, 'campo de password NO renderiza').toBeVisible();

        // Form structure — submit button.
        const submitButton = page.locator('button[type="submit"]').first();
        await expect(submitButton, 'botón submit NO renderiza').toBeVisible();

        // Sin errores JS — hydration limpia.
        expect(
            consoleErrors.filter((e) => !e.includes('favicon')),
            `Errores JS en /login: ${consoleErrors.join(' | ')}`,
        ).toHaveLength(0);
    });

    test('/register renderiza formulario', async ({ page }) => {
        const consoleErrors = [];
        page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

        await page.goto('/register');
        await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });

        // Email input presente.
        const emailInput = page.locator('input[type="email"]').first();
        await expect(emailInput, 'campo de email NO renderiza en /register').toBeVisible();

        // Submit button presente.
        const submitButton = page.locator('button[type="submit"]').first();
        await expect(submitButton, 'botón submit NO renderiza en /register').toBeVisible();

        expect(
            consoleErrors,
            `Errores JS en /register: ${consoleErrors.join(' | ')}`,
        ).toHaveLength(0);
    });

    for (const { path, label } of PROTECTED_ROUTES) {
        test(`${path} sin auth → redirect a /login (${label})`, async ({ page }) => {
            // ProtectedRoute debería redirigir vía <Navigate to="/login">.
            // Esperar a que la URL se estabilice en /login.
            await page.goto(path);

            // Race condition possible: ProtectedRoute renderiza primero
            // <div className="h-screen w-screen bg-slate-50/50" /> mientras
            // loadingAuth=true, luego ejecuta el redirect. Esperar a que
            // la URL final sea /login (timeout 10s para tolerar el waiting
            // period de 5s del getSessionWithTimeout en AssessmentContext).
            await page.waitForURL('**/login', { timeout: 15_000 });
            expect(page.url(), `${path} no redirigió a /login`).toContain('/login');

            // Sanity: el form de login debe estar visible post-redirect.
            const emailInput = page.locator('input[type="email"]').first();
            await expect(emailInput).toBeVisible({ timeout: 5_000 });
        });
    }

    test('/login tiene link a /register (gate de captación de nuevos usuarios)', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('#root')).toBeVisible();

        // Buscar un link/anchor que apunte a /register. La UX puede usar
        // <Link to="/register"> o <a href="/register">. Acepta ambos.
        const registerLink = page.locator('a[href="/register"]').first();
        await expect(
            registerLink,
            '/login no tiene link a /register — onboarding break',
        ).toBeVisible();
    });

    test('/login → reset password mode toggle (UX de recovery)', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('#root')).toBeVisible();

        // Heurística: el botón/link que activa "olvidé mi contraseña" debe
        // existir. Buscar texto que contenga "olvid" (Olvidé / Olvidaste /
        // Olvidé mi contraseña) o "recupera".
        const forgotTrigger = page
            .locator(
                'button, a',
                {
                    hasText: /olvid|recupera|forgot|reset/i,
                },
            )
            .first();
        await expect(
            forgotTrigger,
            '/login no tiene trigger para reset password — flow rota perdido',
        ).toBeVisible();
    });

    test('navegación SPA entre /login y /register no hace full reload', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('input[type="email"]').first()).toBeVisible();

        // Marcar un sentinel en la window — si la navegación es SPA, persiste;
        // si es full reload, se pierde.
        await page.evaluate(() => {
            window.__spa_sentinel = 'persisted';
        });

        // Click en el link a /register.
        const registerLink = page.locator('a[href="/register"]').first();
        await registerLink.click();
        await page.waitForURL('**/register', { timeout: 5_000 });

        // El sentinel debería persistir si fue SPA navigation.
        const sentinel = await page.evaluate(() => window.__spa_sentinel);
        expect(
            sentinel,
            'Navegación login → register fue full reload (sentinel perdido). ' +
            'Probable que un anchor `<a href="/register">` se procesó como ' +
            'navegación nativa en lugar de React Router. Reemplazar por <Link>.',
        ).toBe('persisted');
    });
});
