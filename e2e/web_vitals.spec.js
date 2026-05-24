// @ts-check
import { test, expect } from '@playwright/test';

/**
 * [F-P1-3 · 2026-05-23] Web Vitals measurement script.
 *
 * Cierra el gap F-P1-3 del audit production-readiness 2026-05-23:
 * "Sin Web Vitals (LCP/FID/CLS) medidos en CI — regresión de performance
 * invisible".
 *
 * Scope:
 *   Captura LCP, CLS, FCP, TTFB usando la API performance del browser via
 *   Playwright. NO usa lighthouse (ese requiere headless Chrome con flags
 *   especiales + tiempo de run >2min). Las métricas aquí son client-side
 *   reales medidas en una sesión Playwright típica.
 *
 *   FID NO se mide (requiere user interaction real — no aplica en Playwright
 *   smoke). INP (sucesor de FID en Web Vitals 2024+) tampoco.
 *
 * Cómo correr:
 *   npm run test:web-vitals
 *   o
 *   npx playwright test e2e/web_vitals.spec.js
 *
 * Output:
 *   Logs estructurados con LCP/CLS/FCP/TTFB en ms. Verdict PASS/WARN/FAIL
 *   contra thresholds Web Vitals oficiales (Google CRUX):
 *     LCP good <= 2500ms, poor > 4000ms
 *     CLS good <= 0.1, poor > 0.25
 *     FCP good <= 1800ms, poor > 3000ms
 *     TTFB good <= 800ms, poor > 1800ms
 *
 * Limitaciones honestas:
 *   - Playwright preview env != browser real del usuario. Las métricas son
 *     baseline, NO ground truth de campo. Para ground truth usar
 *     web-vitals.js + endpoint analytics (Posthog/PostHog Cloud, Vercel
 *     Speed Insights) que ya captura métricas en producción.
 *   - El thresholds se aplican a un dispositivo desktop sin throttling —
 *     real mobile users verán peores números. Considerar Playwright CDP
 *     throttling para simular 4G/CPU 4x slow en future P-fix.
 *   - LCP en una home pública sin imágenes hero grandes tiende a ser
 *     pequeño (~500-1500ms). Tras añadir imágenes/copy más rica, este
 *     test alerta si LCP sube >2500ms.
 *
 * Anchor: F-P1-3-WEB-VITALS | audit 2026-05-23.
 */

const WEB_VITALS_THRESHOLDS = {
    lcp:  { good: 2500, poor: 4000, unit: 'ms', description: 'Largest Contentful Paint' },
    cls:  { good: 0.1,  poor: 0.25, unit: '',   description: 'Cumulative Layout Shift' },
    fcp:  { good: 1800, poor: 3000, unit: 'ms', description: 'First Contentful Paint' },
    ttfb: { good: 800,  poor: 1800, unit: 'ms', description: 'Time To First Byte' },
};

/**
 * Inyecta el snippet de medición y espera a que las métricas LCP/CLS se
 * estabilicen (LCP tras user interaction or 5s; CLS tras 5s settle).
 * Usa la PerformanceObserver API nativa del browser.
 */
async function measureWebVitals(page, settleMs = 5000) {
    return await page.evaluate((settleMs) => {
        return new Promise((resolve) => {
            const metrics = {
                lcp: 0,
                cls: 0,
                fcp: 0,
                ttfb: 0,
            };

            // LCP — Largest Contentful Paint.
            // Cada nuevo elemento "más grande" actualiza el valor; finaliza
            // tras user interaction o cuando se desconecta el observer.
            try {
                const lcpObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    const last = entries[entries.length - 1];
                    if (last) metrics.lcp = last.renderTime || last.loadTime || last.startTime;
                });
                lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
            } catch (e) { /* browser sin soporte */ }

            // CLS — Cumulative Layout Shift.
            // Suma el `value` de cada layout-shift entry hasta que se
            // desconecte el observer.
            try {
                const clsObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        // Solo entries sin user input son CLS reales.
                        if (!entry.hadRecentInput) {
                            metrics.cls += entry.value;
                        }
                    }
                });
                clsObserver.observe({ type: 'layout-shift', buffered: true });
            } catch (e) { /* browser sin soporte */ }

            // FCP — First Contentful Paint.
            try {
                const fcpEntries = performance.getEntriesByType('paint');
                const fcpEntry = fcpEntries.find((e) => e.name === 'first-contentful-paint');
                if (fcpEntry) metrics.fcp = fcpEntry.startTime;
            } catch (e) { /* ignore */ }

            // TTFB — Time To First Byte (responseStart - requestStart).
            try {
                const navEntries = performance.getEntriesByType('navigation');
                if (navEntries.length > 0) {
                    const nav = navEntries[0];
                    metrics.ttfb = nav.responseStart - nav.requestStart;
                }
            } catch (e) { /* ignore */ }

            // Esperar a que LCP/CLS se estabilicen, luego resolve.
            setTimeout(() => {
                // Re-leer FCP/TTFB por si arrived después del initial check.
                try {
                    const fcpEntries = performance.getEntriesByType('paint');
                    const fcpEntry = fcpEntries.find((e) => e.name === 'first-contentful-paint');
                    if (fcpEntry && !metrics.fcp) metrics.fcp = fcpEntry.startTime;
                } catch (e) { /* ignore */ }
                resolve(metrics);
            }, settleMs);
        });
    }, settleMs);
}

function classifyMetric(name, value) {
    const t = WEB_VITALS_THRESHOLDS[name];
    if (!t) return 'UNKNOWN';
    if (value <= t.good) return 'GOOD';
    if (value <= t.poor) return 'NEEDS_IMPROVEMENT';
    return 'POOR';
}

function formatReport(metrics, route) {
    const lines = [
        `\n[F-P1-3-WEB-VITALS] Route: ${route}`,
        '─'.repeat(70),
    ];
    for (const [key, val] of Object.entries(metrics)) {
        const t = WEB_VITALS_THRESHOLDS[key];
        const verdict = classifyMetric(key, val);
        const displayVal = typeof val === 'number'
            ? (t?.unit === '' ? val.toFixed(3) : val.toFixed(0))
            : val;
        lines.push(
            `  ${key.toUpperCase().padEnd(6)} ${String(displayVal).padStart(8)}${t?.unit || ''}  ` +
            `[${verdict}]  (good ≤ ${t?.good}${t?.unit}, poor > ${t?.poor}${t?.unit})  ${t?.description || ''}`,
        );
    }
    return lines.join('\n');
}

test.describe('Web Vitals baseline', () => {
    // Routes representativas — home pública sin auth.
    const ROUTES = [
        '/',
        '/login',
        '/register',
    ];

    for (const route of ROUTES) {
        test(`Web Vitals para ${route}`, async ({ page }) => {
            // Navegar + esperar a network idle para LCP estable.
            await page.goto(route, { waitUntil: 'networkidle', timeout: 15_000 });

            // Esperar al primer paint antes de medir.
            await page.waitForLoadState('domcontentloaded');

            const metrics = await measureWebVitals(page, 3000);

            // Imprimir reporte legible — visible en CI logs.
            console.log(formatReport(metrics, route));

            // FAIL si CUALQUIER métrica entra en zona POOR. WARN es OK
            // (vitest soporta `test.fail` pero usamos `expect` strict).
            // NB: NO usamos thresholds estrictos en este smoke — solo
            // POOR threshold (regresión clara). NEEDS_IMPROVEMENT pasa.
            for (const [key, val] of Object.entries(metrics)) {
                const verdict = classifyMetric(key, val);
                expect(
                    verdict,
                    `${key.toUpperCase()}=${val} en ${route} cayó a ${verdict} ` +
                    `(threshold POOR: ${WEB_VITALS_THRESHOLDS[key]?.poor}${WEB_VITALS_THRESHOLDS[key]?.unit}). ` +
                    `Regresión visible — revisar el commit que tocó assets/lazy/bundle.`,
                ).not.toBe('POOR');
            }
        });
    }

    test('LCP element es el esperado (no regresión de hero img)', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });

        // Capturar el elemento que registró el último LCP.
        const lcpElement = await page.evaluate(() => {
            return new Promise((resolve) => {
                const observer = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    const last = entries[entries.length - 1];
                    if (last) {
                        resolve({
                            tagName: last.element?.tagName || 'unknown',
                            url: last.url || null,
                            size: last.size || 0,
                            renderTime: last.renderTime || last.loadTime || 0,
                        });
                    }
                });
                observer.observe({ type: 'largest-contentful-paint', buffered: true });
                setTimeout(() => resolve({ tagName: 'TIMEOUT', url: null, size: 0, renderTime: 0 }), 3000);
            });
        });

        console.log(`[F-P1-3-WEB-VITALS] LCP element en /:`, lcpElement);

        // Sanity: el LCP element NO debería ser una imagen de fondo
        // peso pesado (>500KB) — si lo es, optimizarla.
        if (lcpElement.url && lcpElement.size) {
            const sizeKb = lcpElement.size / 1024;
            expect(
                sizeKb,
                `LCP element ${lcpElement.url} pesa ${sizeKb.toFixed(0)}KB — ` +
                `considerar WebP/AVIF + srcset responsive.`,
            ).toBeLessThan(500);
        }
    });
});
