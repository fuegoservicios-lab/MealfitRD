// @ts-check
import { test, expect } from './fixtures';

/**
 * [P3-E2E-PLAYWRIGHT · 2026-05-12] Smoke tests del golden-path.
 *
 * Scope INTENCIONALMENTE mínimo — cubre los modos de fallo que escapan a
 * Vitest unit + parser-based tests pero NO requiere Supabase test fixtures:
 *   1. La home pública carga y renderiza sin crash de hydration.
 *   2. La navegación SPA funciona (fallback SPA de nginx → /index.html).
 *   3. El splash screen `#pwa-splash` se desmonta tras hydration.
 *   4. Las fuentes self-hosted P3-SELF-HOST-FONTS cargan (no FOUT eterno).
 *   5. Los headers de seguridad P1-VERCEL-SECURITY-HEADERS (ahora en nginx) llegan al browser
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
      if (msg.type() !== 'error') return;
      /* [P2-CROSS-BROWSER · 2026-08-18] EL RUIDO DE `/api/` NO CUENTA, Y NO SE
         AMPLÍA ESTE FILTRO. Sin backend levantado —ni en local ni en CI lo hay—
         `/api/plans/pending-status` devuelve 500 y el navegador anota un
         `console.error` de red. Es del entorno, no de la página; el test hermano
         de `landing_depth.spec.js` lleva este mismo filtro y explica lo mismo.

         Lo que destapó esto: al arreglar la espera —antes medía con `#root`
         visible, o sea a los pocos cientos de milisegundos— este test empezó a
         fallar en chromium Y en webkit. No había regresión ninguna: es que
         durante meses no comprobaba «cero errores de consola», comprobaba «cero
         errores ANTES de que llegara la primera respuesta de red». Una aserción
         que se evalúa antes de que ocurra lo que vigila pasa siempre.

         Se filtra por la URL del recurso, no por el texto: el mensaje del
         navegador es genérico («Failed to load resource: … 500») y no nombra la
         ruta. Filtrar por texto se tragaría también un 500 de un recurso propio. */
      const url = msg.location?.()?.url || '';
      if (url.includes('/api/')) return;
      /* [P0-FE-CI-RED · 2026-09-04] Mismo filtro EXACTO que `landing_depth.spec.js`: WebKit
         registra como error que ignora `interactive-widget` del meta viewport. Ruido del
         motor, no de la página. */
      if (/Viewport argument key "interactive-widget" not recognized/.test(msg.text())) return;
      consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.goto('/');
    /* [P2-CROSS-BROWSER · 2026-08-18] ESPERAR LO QUE EL COMENTARIO DECÍA QUE SE
       esperaba. La línea rezaba «wait for splash to fade» y lo que hacía era
       esperar a que `#root` fuera VISIBLE, que ocurre bastante antes: `#root`
       tiene caja en cuanto React monta el splash, con el contenido aún sin
       pintar. Bajo carga —tres motores en paralelo— eso dejó el `innerText`
       del body por debajo de los 20 caracteres que la última aserción exige, y
       el test acusó una página en blanco que no existía. La señal correcta la
       usaba ya el test de aquí al lado: el splash DESAPARECIDO. */
    await expect(page.locator('#pwa-splash')).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });

    // Validar que NO hubo ningún error de JS durante hydration.
    // GlobalErrorBoundary + process.env crash (P0-FRONTEND-ANALYTICS) eran
    // los modos de fallo. Si vuelve a aparecer un `process is not defined`,
    // este test lo captura inmediato.
    expect(
      consoleErrors.filter((e) => !e.includes('favicon')),
      `Errors capturados: ${consoleErrors.join(' | ')}`
    ).toHaveLength(0);

    /* Hay contenido renderizado (no blank page).

       [P2-CROSS-BROWSER · 2026-08-18] CON REINTENTO, no de un solo disparo. Un
       `await page.locator('body').innerText()` lee UNA vez: si en ese instante
       el árbol aún no tiene texto, el test acusa una página en blanco que un
       cuarto de segundo después ya no existe. Bajo la carga de tres motores en
       paralelo eso pasó en Firefox —y solo en Firefox—.

       Es la tercera vez en esta misma tanda que un test mide algo asíncrono sin
       reintentar y el resultado depende de lo cargada que esté la máquina. El
       patrón de Playwright para esto es `expect.poll`, que reevalúa hasta que
       se cumple o vence el plazo: la aserción sigue siendo la misma, lo que
       cambia es que ahora espera a poder responderla. */
    await expect
        .poll(async () => (await page.locator('body').innerText()).length,
              { message: 'Body parece vacío post-hydration', timeout: 10_000 })
        .toBeGreaterThan(20);
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
    // El fallback SPA de nginx (`try_files ... /index.html`) permite que el
    // router cliente tome cualquier ruta. Sin el rewrite, la URL directa devuelve 404.
    const res = await page.goto('/dashboard');
    expect(res?.status(), 'rewrite SPA roto').toBeLessThan(500);
    // ProtectedRoute redirigirá a /auth — pero NO debe ser 404.
    await expect(page.locator('#root')).toBeVisible();
  });
});
