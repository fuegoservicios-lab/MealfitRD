/* [P1-SECCIONES-03-04-PROFUNDIDAD · 2026-08-02] Guard de navegador.
   El test parser-based comprueba que las reglas ESTÁN escritas; este comprueba
   que el navegador las APLICA — que es donde vive la diferencia entre «el CSS
   dice rotateY» y «la hoja se ve inclinada». */
import { test, expect } from '@playwright/test';

test.describe('03/04 — profundidad', () => {
    test('a >=1024px las hojas estan transformadas Y la lamina se ABRE', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/');
        const link = page.locator('#dashboard a').first();
        await link.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1400); // la apertura dura 900ms + escalonado
        const t = await link.evaluate((el) => getComputedStyle(el).transform);
        expect(t).not.toBe('none');
        expect(t).toMatch(/^matrix3d/);

        /* ⚠ `matrix3d` NO BASTA, y este es el único sitio donde se puede
           comprobar. El estado CERRADO también es `matrix3d` (−28deg, −240px),
           así que un observer que nunca dispare —o una condición saboteada
           tipo `&& false`— dejaría la lámina cerrada para siempre y este test
           seguiría verde.

           El guard parser-based no puede cerrarlo por construcción: verifica
           que el texto está, no que se ejecute. Lo encontró un subagente
           mutando su propio test. Aquí sí se puede: se exige el estado ABIERTO. */
        const sheet = page.locator('#dashboard [class*="sheet"]').first();
        await expect(sheet).toHaveAttribute('data-open', '1');
    });

    test('bajo 1024px NO hay 3D', async ({ page }) => {
        await page.setViewportSize({ width: 900, height: 900 });
        await page.goto('/');
        const link = page.locator('#dashboard a').first();
        await link.scrollIntoViewIfNeeded();
        const t = await link.evaluate((el) => getComputedStyle(el).transform);
        expect(t === 'none' || !t.startsWith('matrix3d')).toBe(true);
    });

    test('la pagina no scrollea en horizontal', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/');
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });

    test('cero pageerror y cero console.error en /', async ({ page }) => {
        /* ⚠ EL FILTRO DE `/api/` NO ES PEREZA, Y NO DEBE AMPLIARSE. Medido: al
           cargar `/` sin el backend levantado, `/api/plans/pending-status`
           devuelve 500 y el navegador registra un `console.error` de red. Es
           ruido del entorno, no del landing, y sin acotarlo este test fallaría
           siempre en local por una causa ajena a lo que vigila.

           `pageerror` NO se filtra: un error de JS no ejecutado es exactamente
           lo que este test existe para cazar. */
        const errores = [];
        page.on('pageerror', (e) => errores.push(`pageerror: ${e}`));
        page.on('console', (m) => {
            if (m.type() !== 'error') return;
            const t = m.text();
            if (t.includes('/api/') || t.includes('Failed to load resource')) return;
            errores.push(`console: ${t}`);
        });
        await page.goto('/');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);
        expect(errores).toEqual([]);
    });
});
