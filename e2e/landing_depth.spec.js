/* [P1-SECCIONES-03-04-PROFUNDIDAD · 2026-08-02] Guard de navegador.
   El test parser-based comprueba que las reglas ESTÁN escritas; este comprueba
   que el navegador las APLICA — que es donde vive la diferencia entre «el CSS
   dice rotateY» y «la hoja se ve inclinada». */
// @ts-check
import { test, expect } from '@playwright/test';

test.describe('03/04 — profundidad', () => {
    test('a >=1024px las hojas estan transformadas Y la lamina se ABRE', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/');
        const link = page.locator('#dashboard a').first();
        /* Antes de hacer scroll la lamina tiene que estar CERRADA: sin esto,
           una mutacion que arranque `open` en true pasaria el test entero. */
        const sheetPre = page.locator('#dashboard [class*="sheet"]').first();
        await expect(sheetPre).toHaveAttribute('data-open', '0');

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

    test('la pagina no scrollea en horizontal — con la lamina ABIERTA', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/');

        /* ⚠ HAY QUE ABRIR LA LÁMINA ANTES DE MEDIR. Cerrada, `--z` vale
           −240px y la perspectiva encoge ópticamente las cinco hojas: se mide
           la pose más estrecha que existe, no la que ve el usuario. La pose
           abierta llega a `--z: +56px`, que es la que puede ensanchar la
           página — y es justo lo que un reajuste futuro de `--ry`/`--z` (que
           el plan declara parámetros afinables) podría romper. */
        const sheet = page.locator('#dashboard [class*="sheet"]').first();
        await sheet.scrollIntoViewIfNeeded();
        await expect(sheet).toHaveAttribute('data-open', '1');

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
            /* ⚠ SE FILTRA POR URL, NO POR TEXTO. «Failed to load resource» es
               el mensaje GENÉRICO de Chrome para cualquier recurso caído —una
               fuente, una imagen, un chunk— y su `.text()` NO lleva la URL.
               Filtrar por ese texto silenciaría precisamente una regresión de
               assets en los mockups de esta sección, que es lo que este test
               debería cazar. `location().url` sí distingue. */
            const url = m.location()?.url || '';
            if (url.includes('/api/')) return;
            errores.push(`console: ${m.text()} @ ${url}`);
        });
        await page.goto('/');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);
        expect(errores).toEqual([]);
    });
});
