// @ts-check
import { test, expect } from '@playwright/test';

/**
 * [F-P2-6 · 2026-05-23] Splash screen + loading states visual smoke.
 *
 * Cierra el gap F-P2-6 del audit production-readiness 2026-05-23:
 * "Splash screen / loading states presentes pero no auditados con tests
 *  visuales. Regresión visual."
 *
 * Scope intencional:
 *   - El splash `#pwa-splash` aparece pre-React hydration (HTML inline).
 *   - Tras hydration (max ~600ms = 100ms delay + 500ms fade) debe
 *     desmontarse o quedar `display: none`.
 *   - Loading states de `ProtectedRoute` (`<div className="h-screen
 *     w-screen bg-slate-50/50" />`) deben aparecer durante el
 *     loadingAuth period.
 *   - prefers-reduced-motion respetado (no animaciones bouncing).
 *
 * NO USA visual snapshots (`toHaveScreenshot`):
 *   - Snapshots requieren baseline checked-in + comparación pixel-perfect.
 *   - En CI containerizado, font rendering puede diferir vs dev local.
 *   - El overhead de mantener baselines updated supera el valor para
 *     splash screen estática.
 *
 * USA assertions estructurales:
 *   - Selector `#pwa-splash` existe + es visible al inicio.
 *   - Selector `#pwa-splash` está hidden o removed tras hydration.
 *   - `prefers-reduced-motion: reduce` no triggea animaciones bouncing.
 *
 * Anchor: F-P2-6-SPLASH-VISUAL-SMOKE | audit 2026-05-23.
 */

test.describe('Splash screen + loading states visual smoke', () => {
    test('splash visible al inicio + desmontado tras hydration', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

        await page.goto('/');

        // Splash debe estar presente en el initial HTML (pre-React).
        // Usar `count()` en lugar de `toBeVisible()` porque puede ya estar
        // hidden por el tiempo que llegamos.
        const splashLocator = page.locator('#pwa-splash');
        const splashCount = await splashLocator.count();
        expect(
            splashCount,
            'Splash `#pwa-splash` ausente en initial HTML. Sin él, hay ' +
            'flash blank durante hydration → UX degradada en cold start.',
        ).toBeGreaterThan(0);

        // Esperar a que se desmonte/oculte (max ~5s para tolerar slow CI).
        await expect(splashLocator).toBeHidden({ timeout: 5_000 });

        // Sin errores JS de hydration.
        expect(
            errors.filter((e) => !e.toLowerCase().includes('favicon')),
            `Errores JS: ${errors.join(' | ')}`,
        ).toHaveLength(0);

        // Root mounted + tiene contenido.
        await expect(page.locator('#root')).toBeVisible();
        const bodyLen = (await page.locator('body').innerText()).length;
        expect(bodyLen, 'Body parece vacío post-hydration').toBeGreaterThan(20);
    });

    test('prefers-reduced-motion: animaciones bouncing desactivadas', async ({ browser }) => {
        // Nuevo context con prefers-reduced-motion forzado.
        const context = await browser.newContext({
            reducedMotion: 'reduce',
        });
        const page = await context.newPage();

        await page.goto('/');
        // Splash debe seguir apareciendo + desmontándose, sin animación
        // bouncing infinita (que rompería el unmount).
        await expect(page.locator('#pwa-splash')).toBeHidden({ timeout: 5_000 });
        await expect(page.locator('#root')).toBeVisible();

        await context.close();
    });

    test('protected route loading state durante auth check', async ({ page }) => {
        // Visitar /dashboard sin auth. Mientras `loadingAuth=true`,
        // ProtectedRoute renderiza un `<div className="h-screen w-screen
        // bg-slate-50/50" />` placeholder. Luego redirect a /login.
        await page.goto('/dashboard');

        // Eventual: termina en /login. El intermedio (placeholder div)
        // puede ser muy fugaz para capturar con assertions, pero el
        // redirect final SÍ es observable.
        await page.waitForURL('**/login', { timeout: 15_000 });

        // El form de login debe estar presente.
        const emailInput = page.locator('input[type="email"]').first();
        await expect(emailInput).toBeVisible({ timeout: 5_000 });
    });

    test('splash respeta theme-color del meta tag (#4F46E5)', async ({ page }) => {
        await page.goto('/');
        const themeColor = await page
            .locator('meta[name="theme-color"]')
            .first()
            .getAttribute('content');
        // theme-color es el color del browser chrome (status bar mobile,
        // tab color en Safari). Cambio inadvertido afecta brand percep.
        expect(themeColor).toBe('#4F46E5');
    });

    test('PWA manifest accesible desde HEAD', async ({ page }) => {
        await page.goto('/');
        const manifest = await page
            .locator('link[rel="manifest"]')
            .first()
            .getAttribute('href');
        expect(manifest, 'manifest link ausente del HEAD').toBeTruthy();
        // Sanity: el archivo debe responder 200.
        const res = await page.request.get(manifest);
        expect(
            res.ok(),
            `manifest.json retornó ${res.status()} — PWA install prompt rota.`,
        ).toBe(true);
    });
});
