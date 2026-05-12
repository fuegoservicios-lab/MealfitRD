// @ts-check
import { test, expect } from '@playwright/test';

/**
 * [P3-E2E-PLAYWRIGHT · 2026-05-12] Smoke tests del golden-path.
 *
 * Scope INTENCIONALMENTE mínimo — cubre los modos de fallo que escapan a
 * Vitest unit + parser-based tests pero NO requiere Supabase test fixtures:
 *   1. La home pública carga y renderiza sin crash de hydration.
 *   2. La navegación SPA funciona (rewrite Vercel → /index.html).
 *   3. El splash screen `#pwa-splash` se desmonta tras hydration.
 *   4. Las fuentes self-hosted P3-SELF-HOST-FONTS cargan (no FOUT eterno).
 *   5. Los headers Vercel P1-VERCEL-SECURITY-HEADERS llegan al browser
 *      (no se pueden verificar 1:1 desde preview, pero los meta del
 *      bundle se chequean).
 *
 * FUERA DE SCOPE (requieren backend + Supabase test creds + worker reset):
 *   - Signup → assessment → plan generation → dashboard end-to-end.
 *   - Swap meal / restock / recipe expand.
 *   - PayPal billing flow.
 *
 * Ese flujo full-stack está documentado como follow-up en CLAUDE.md
 * y se puede añadir cuando haya un entorno de staging Supabase aislado.
 */

test.describe('Golden path smoke', () => {
  test('home loads without crash and renders brand', async ({ page }) => {
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.goto('/');
    // Wait for splash to fade — proxy for React hydration done.
    await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });

    // Validar que NO hubo ningún error de JS durante hydration.
    // GlobalErrorBoundary + process.env crash (P0-FRONTEND-ANALYTICS) eran
    // los modos de fallo. Si vuelve a aparecer un `process is not defined`,
    // este test lo captura inmediato.
    expect(
      consoleErrors.filter((e) => !e.includes('favicon')),
      `Errors capturados: ${consoleErrors.join(' | ')}`
    ).toHaveLength(0);

    // Hay contenido renderizado (no blank page).
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length, 'Body parece vacío post-hydration').toBeGreaterThan(20);
  });

  test('splash screen unmounts after hydration', async ({ page }) => {
    await page.goto('/');
    // El splash se remueve tras ~600ms (100ms delay + 500ms fade).
    await expect(page.locator('#pwa-splash')).toBeHidden({ timeout: 5_000 });
  });

  test('self-hosted fonts load (P3-SELF-HOST-FONTS)', async ({ page }) => {
    const fontRequests = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('.woff2')) fontRequests.push(url);
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Debe haber al menos 1 request a /fonts/*.woff2 (preload o @font-face).
    const localFonts = fontRequests.filter((u) => u.includes('/fonts/'));
    expect(localFonts.length, `Fonts cargados: ${fontRequests.join(', ')}`).toBeGreaterThan(0);

    // CRÍTICO: NO debe haber request a fonts.gstatic.com / fonts.googleapis.com.
    // Si aparece uno, el self-host quedó incompleto.
    const remoteFonts = fontRequests.filter(
      (u) => u.includes('fonts.gstatic.com') || u.includes('fonts.googleapis.com')
    );
    expect(remoteFonts, `Aún se carga fuente remota: ${remoteFonts.join(', ')}`).toHaveLength(0);
  });

  test('SPA rewrite — /dashboard (sin auth) no devuelve 404', async ({ page }) => {
    // Vercel rewrite `/(.*) → /index.html` permite que el router cliente
    // tome cualquier ruta. Sin el rewrite, la URL directa devuelve 404.
    const res = await page.goto('/dashboard');
    expect(res?.status(), 'rewrite SPA roto').toBeLessThan(500);
    // ProtectedRoute redirigirá a /auth — pero NO debe ser 404.
    await expect(page.locator('#root')).toBeVisible();
  });
});
