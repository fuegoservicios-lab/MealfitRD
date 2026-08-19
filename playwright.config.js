// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * [P3-E2E-PLAYWRIGHT · 2026-05-12] Playwright config para tests e2e
 * smoke del golden-path. Pre-fix el repo no tenía cobertura e2e — solo
 * ~120 tests Vitest unit + ~80 parser-based en backend. Regresiones de UX
 * (router roto, hydration crash, blank page tras deploy) entraban a
 * producción sin trip-wire.
 *
 * Diseño minimalista:
 *   - [P2-CROSS-BROWSER · 2026-08-18] TRES motores, no uno. La versión anterior
 *     corría solo chromium razonando que «la mayoría de bugs JS son
 *     cross-browser idénticos a este nivel de smoke». Es cierto de los bugs de
 *     lógica y falso justo donde más duele: Safari/iOS es WebKit, y en un
 *     producto mobile-first con PWA ahí es donde viven las diferencias que no
 *     se comparten — `Intl` y fechas, `100vh` con la barra de direcciones,
 *     `backdrop-filter`, el momento del `scroll`, la API de notificaciones.
 *     Correr solo chromium es no mirar precisamente al navegador que no puedes
 *     reproducir desde Windows.
 *   - `webServer` arranca `npm run preview` (build production-like) en
 *     :5174. NO usa `npm run dev` para evitar HMR/StrictMode noise.
 *   - `baseURL` apunta al preview; `goto('/')` lleva a la home.
 *   - `retries: 2` en CI para resilencia ante flakes de red/timing.
 *   - Sin auth state global — el smoke test cubre la home pública +
 *     navegación, no flow autenticado (eso requeriría Supabase test fixtures
 *     que está fuera del scope de P3).
 *
 * Anchor: P3-E2E-PLAYWRIGHT.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      // El que de verdad justifica esto: WebKit es el motor de Safari y el de
      // TODOS los navegadores de iOS. No hay forma de probarlo a mano desde
      // Windows, asi que o corre aqui o no corre.
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 5174 --host 127.0.0.1',
        url: 'http://127.0.0.1:5174',
        reuseExistingServer: !process.env.CI,
        timeout: 60 * 1000,
      },
});
