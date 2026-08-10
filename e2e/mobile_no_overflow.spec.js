// @ts-check
import { test, expect } from '@playwright/test';

/**
 * [P1-MOBILE-FIT · 2026-08-09] Nada medía el landing a anchos de móvil, y por
 * ese hueco entró un defecto a producción: la franja del hero pedía 375,7px
 * (180,4 + 195,3) y a 320px se cortaban 55,7px de texto.
 *
 * POR QUÉ NADIE LO REPORTÓ ANTES. `html` y `body` llevan `overflow-x: clip`.
 * Un desborde horizontal NO produce scroll —que sería visible y molesto—, sino
 * un recorte mudo: la palabra desaparece por el borde derecho y la página
 * parece intacta. Los guards de este repo son parsers de código fuente y
 * ninguno puede ver un ancho intrínseco de texto: eso solo lo sabe un motor de
 * render con la fuente cargada. De ahí este fichero.
 *
 * QUÉ MIDE: que ningún elemento del landing sobresalga del viewport en los
 * cuatro anchos de contrato. Cubre la CLASE entera de bugs —cualquier literal,
 * padding o `min-width` que un día no quepa—, no la instancia que lo motivó.
 *
 * 320px NO es teórico: es lo que renderiza un iPhone con Display Zoom activado.
 * Es el suelo del contrato y por eso encabeza la lista.
 *
 * PAREJA OBLIGATORIA: `backend/tests/test_p1_mobile_fit.py` ancla las decisiones
 * de diseño contra el CSS y exige que este fichero siga existiendo. Ese corre en
 * cada pytest; este necesita un navegador. Ninguno sustituye al otro.
 */

const ANCHOS = [320, 360, 390, 430];

/** Elementos cuyo borde sale del viewport, con datos para diagnosticar. */
async function desbordes(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const fuera = [];
    document.querySelectorAll('body *').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      // `srOnly` es la técnica estándar de accesibilidad: una caja de 1px con
      // el contenido desbordado a propósito para lectores de pantalla. Excluirla
      // por CLASE sería frágil; se excluye por su firma real (caja de ~1px).
      if (b.width <= 2 && b.height <= 2) return;
      if (b.right > vw + 0.5 || b.left < -0.5) {
        fuera.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className?.baseVal ?? el.className ?? '').slice(0, 60),
          left: Math.round(b.left),
          right: Math.round(b.right),
          vw,
          txt: (el.textContent || '').trim().slice(0, 48),
        });
      }
    });
    return fuera;
  });
}

test.describe('Landing sin desbordes en móvil', () => {
  for (const width of ANCHOS) {
    test(`ningún elemento se sale del viewport a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });

      // Recorrer la página entera: las secciones de abajo montan su contenido
      // con `whileInView`, así que sin este barrido se mediría media página.
      await page.evaluate(async () => {
        const alto = document.documentElement.scrollHeight;
        for (let y = 0; y < alto; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 80));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1500);

      const fuera = await desbordes(page);
      expect(
        fuera,
        `P1-MOBILE-FIT: ${fuera.length} elemento(s) fuera del viewport a ${width}px. ` +
          `Con overflow-x: clip esto NO se ve como scroll, se ve como texto cortado. ` +
          JSON.stringify(fuera, null, 1)
      ).toEqual([]);
    });
  }

  test('las descripciones de «cómo se calcula» se leen enteras a 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });

    // ESPERAR A QUE EXISTAN, y exigir las cuatro. Sin esto el test corría antes
    // de que React pintara la sección, `querySelectorAll` devolvía cero y el
    // bucle vacío pasaba en verde contra el código roto. Un test que mide un
    // conjunto vacío no mide nada — y de paso, si alguien renombra la clase,
    // esta cuenta lo delata en vez de dejar el guard mudo.
    const descripciones = page.locator('[class*="cellDesc"]');
    await expect(
      descripciones,
      'P1-MOBILE-FIT: no aparecen las 4 descripciones de la sección. O cambió ' +
        'el nombre de la clase, o la sección no montó: en ambos casos este ' +
        'guard estaría midiendo el vacío.'
    ).toHaveCount(4, { timeout: 10_000 });

    const recortadas = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[class*="cellDesc"]').forEach((el) => {
        // MEDIR CLONANDO, no con `scrollHeight`. Primera versión de este test
        // comparaba `scrollHeight > clientHeight` y PASÓ contra el código roto:
        // con `display: -webkit-box` el recorte ocurre en el LAYOUT, así que la
        // caja no tiene overflow que declarar y las dos alturas coinciden. Un
        // guard que no falla contra el bug que lo motivó no guarda nada.
        //
        // El clon mide lo que el texto pediría sin ninguna restricción, así que
        // también caza un recorte hecho con `max-height` u otra técnica futura.
        const cs = getComputedStyle(el);
        const clon = el.cloneNode(true);
        clon.style.cssText =
          `position:absolute;visibility:hidden;display:block;max-height:none;` +
          `-webkit-line-clamp:unset;width:${el.clientWidth}px;font:${cs.font};` +
          `line-height:${cs.lineHeight}`;
        el.parentElement.appendChild(clon);
        const alturaReal = clon.getBoundingClientRect().height;
        clon.remove();

        if (alturaReal > el.clientHeight + 2) {
          const lh = parseFloat(cs.lineHeight) || 1;
          out.push({
            txt: (el.textContent || '').trim().slice(0, 40),
            lineasVisibles: Math.round(el.clientHeight / lh),
            lineasReales: Math.round(alturaReal / lh),
          });
        }
      });
      return out;
    });

    expect(
      recortadas,
      'P1-MOBILE-FIT: hay descripciones con texto escondido. Un recorte sin ' +
        'expansor promete un resto que nadie puede cobrar. ' +
        JSON.stringify(recortadas, null, 1)
    ).toEqual([]);
  });

  test('la metodología plegada se puede desplegar entera a 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });

    // Se localiza por lo que GOBIERNA (`aria-controls`), no por su texto: el
    // texto cambia al pulsarlo, así que un locator por nombre encuentra el
    // botón antes del clic y lo pierde después — la primera versión de este
    // test falló exactamente así. La identidad de un control es lo que hace,
    // no cómo se llama ahora mismo.
    const boton = page.locator('button[aria-controls="benchmark-metodologia"]');
    await boton.scrollIntoViewIfNeeded();
    await expect(boton).toBeVisible();
    // Que el literal SIGA describiendo el estado es parte del contrato: sin
    // esto, el botón podría quedarse mudo («Metodología») y el test no se
    // enteraría de que ya no dice si abre o cierra.
    await expect(boton).toHaveAccessibleName(/leer/i);

    const nota = page.locator('#benchmark-metodologia');
    const altoPlegado = (await nota.boundingBox())?.height ?? 0;

    await boton.click();
    await expect(boton).toHaveAttribute('aria-expanded', 'true');
    await expect(boton).toHaveAccessibleName(/ocultar/i);
    const altoAbierto = (await nota.boundingBox())?.height ?? 0;

    // La prueba de que el plegado NO esconde: abrirlo devuelve MÁS texto del
    // que había. Si alguien deja el botón pero rompe la clase que lo despliega,
    // las dos alturas coinciden y esto cae.
    expect(
      altoAbierto,
      `P1-MOBILE-FIT: desplegar no devolvió texto (plegado ${altoPlegado}px, ` +
        `abierto ${altoAbierto}px). Un control que no deshace el recorte es peor ` +
        'que no tenerlo: promete el resto y no lo entrega.'
    ).toBeGreaterThan(altoPlegado + 20);
  });

  test('los controles del landing se pueden tocar con el pulgar a 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1200);

    // Misma lección que el test de arriba: si el selector deja de casar, medir
    // cero controles pasaría en verde. Son 4 SeeMoreLink + 5 sociales.
    //
    // Y se ESPERA la condición en vez de dormir un rato: la primera versión
    // contaba justo después de un `waitForTimeout` fijo y caía de forma
    // intermitente — con la suite entera en paralelo, la página aún no había
    // montado los 9. El flake no lo causaba lo que el test mide, sino cómo
    // esperaba a poder medirlo.
    const controles = page.locator('a[class*="link"], a[class*="socialIcon"]');
    await expect(
      controles,
      'P1-MOBILE-FIT: no aparecen los controles a medir — el guard estaría vacío.'
    ).toHaveCount(9, { timeout: 10_000 });

    // El área táctil puede venir del propio borde o de un pseudo-elemento que
    // lo agranda sin mover tinta (la técnica de P1-MOBILE-FIT). Se mide el
    // rectángulo EFECTIVO: la unión del borde con el de su ::after.
    const cortos = await page.evaluate(() => {
      const MIN = 44;
      const out = [];
      document.querySelectorAll('a[class*="link"], a[class*="socialIcon"]').forEach((el) => {
        const b = el.getBoundingClientRect();
        const after = getComputedStyle(el, '::after');
        const crece = (v) => {
          const n = parseFloat(v);
          return Number.isNaN(n) || n > 0 ? 0 : -n;
        };
        const h = b.height + crece(after.top) + crece(after.bottom);
        const w = b.width + crece(after.left) + crece(after.right);
        if (h < MIN || w < MIN) {
          out.push({ txt: (el.textContent || '').trim().slice(0, 28), w: Math.round(w), h: Math.round(h) });
        }
      });
      return out;
    });

    expect(
      cortos,
      `P1-MOBILE-FIT: controles por debajo de 44px de área táctil. ${JSON.stringify(cortos, null, 1)}`
    ).toEqual([]);
  });
});
