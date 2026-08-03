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
           una mutacion que arranque `open` en true pasaria el test entero.

           ⚠ CONDICIONADO A QUE LA SECCION ESTE FUERA DE PANTALLA, y no por
           pereza: el observer dispara por interseccion, asi que si el layout
           deja la 03 dentro del viewport inicial el atributo YA vale '1' y la
           asercion es una carrera. Medido: fallaba 1 de cada ~4 pasadas con el
           fichero completo en paralelo, y pasaba siempre en aislamiento. Un
           test intermitente es peor que ninguno; asi solo afirma lo que puede
           afirmar de forma determinista. */
        const sheetPre = page.locator('#dashboard [class*="sheet"]').first();
        const fueraDePantalla = await sheetPre.evaluate(
            (el) => el.getBoundingClientRect().top > window.innerHeight,
        );
        if (fueraDePantalla) {
            await expect(sheetPre).toHaveAttribute('data-open', '0');
        }

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

    /* ⚠ NO SE MIDE `scrollWidth - clientWidth`, Y ESA ERA LA VERSIÓN ANTERIOR.
       `index.css:729-731` declara `html, body { overflow-x: clip }`, que
       ELIMINA la región desbordable: el contenido que se sale no se puede
       alcanzar haciendo scroll, se CORTA. Medido en esta misma página, con la
       cota 30,4px fuera del borde derecho:

           scrollWidth − clientWidth = 0        (con overflow-x: clip)
           scrollWidth − clientWidth = 200      (misma prueba, sin clip)

       O sea que `expect(overflow).toBeLessThanOrEqual(0)` era una tautología
       aquí — y justo el guard que tenía que haber cazado que la cota y su
       rótulo colgaban fuera de la lámina. Se mide el canto derecho de cada
       elemento contra `clientWidth`, que sí ve el recorte.

       ⚠ Y SE MIDE A TRES ANCHOS, NO SOLO A 1440. 1440 es el ÚNICO ancho donde
       el defecto no se veía: `.container` topa en 1280px y se centra, así que
       a 1440 sobran 80px de margen que se tragaban el vuelo. A 1024 y a 1280
       ese margen vale 0. Las nueve verificaciones anteriores se hicieron a
       1440. */
    const ANCHOS = [1024, 1280, 1440];

    for (const ancho of ANCHOS) {
        test(`nada del aparejo de profundidad se sale de la pagina a ${ancho}px — con la lamina ABIERTA`, async ({ page }) => {
            /* ⚠ EL ANCHO QUE MANDA ES `clientWidth`, NO EL DEL VIEWPORT. La
               barra de scroll clásica de Chromium se come ~15px, y las media
               queries se evalúan contra el ancho SIN barra: pedir un viewport
               de 1024 dejaría `clientWidth` en ~1009 y el bloque `@media
               (min-width: 1024px)` NO aplicaría — la cota es `display: none`
               ahí y el test pasaría sin haber mirado nada. Se mide la barra y
               se pide el viewport compensado. */
            await page.setViewportSize({ width: ancho, height: 900 });
            await page.goto('/');
            const barra = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
            if (barra > 0) await page.setViewportSize({ width: ancho + barra, height: 900 });

            /* ⚠ HAY QUE ABRIR LA LÁMINA ANTES DE MEDIR. Cerrada, `--z` vale
               −240px y la perspectiva encoge ópticamente las cinco hojas: se
               mide la pose más estrecha que existe, no la que ve el usuario.
               La pose abierta llega a `--z: +56px`, que es la que puede
               ensanchar la página — y es justo lo que un reajuste futuro de
               `--ry`/`--z` (que el plan declara parámetros afinables) podría
               romper. */
            const sheet = page.locator('#dashboard [class*="sheet"]').first();
            await sheet.scrollIntoViewIfNeeded();
            await expect(sheet).toHaveAttribute('data-open', '1');

            /* ⚠ Y HAY QUE ESPERAR A QUE ASIENTE, NO SOLO A QUE ABRA. El
               atributo cambia SÍNCRONAMENTE con el callback del observer, pero
               la pose tarda hasta ~1.260 ms en llegar (900 de transición + 360
               de escalonado): `view05` ni siquiera arranca hasta 360 ms
               después. Midiendo al vuelo se toma un estado intermedio, y como
               el easing es monótono hacia el valor final, ese estado es
               SIEMPRE más estrecho. El sesgo va todo en la misma dirección: el
               test podría pasar aunque la pose asentada desbordara. */
            await page.waitForTimeout(1400);

            const medida = await page.evaluate(() => {
                const cw = document.documentElement.clientWidth;
                const canto = (sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    return { right: +r.right.toFixed(2), width: +r.width.toFixed(2) };
                };
                const hojas = [...document.querySelectorAll('#dashboard a[class*="viewLink"]')]
                    .map((a) => a.getBoundingClientRect().right);
                return {
                    clientWidth: cw,
                    escena3D: window.matchMedia('(min-width: 1024px)').matches,
                    cota: canto('#dashboard [class*="depthCota"]'),
                    rotulo: canto('#dashboard [class*="depthLabel"]'),
                    hojaMasDerecha: hojas.length ? +Math.max(...hojas).toFixed(2) : null,
                };
            });

            /* Sin esto el test es vacuo: a <1024px la cota no se dibuja y sus
               rectángulos valdrían 0. */
            expect(medida.escena3D).toBe(true);
            expect(medida.clientWidth).toBe(ancho);
            expect(medida.cota).not.toBeNull();
            expect(medida.rotulo).not.toBeNull();
            expect(medida.cota.width).toBeGreaterThan(0);
            expect(medida.rotulo.width).toBeGreaterThan(0);

            expect(medida.cota.right, `cota a ${ancho}px`).toBeLessThanOrEqual(medida.clientWidth);
            expect(medida.rotulo.right, `rotulo a ${ancho}px`).toBeLessThanOrEqual(medida.clientWidth);
            expect(medida.hojaMasDerecha, `hoja mas a la derecha a ${ancho}px`)
                .toBeLessThanOrEqual(medida.clientWidth);
        });
    }

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
