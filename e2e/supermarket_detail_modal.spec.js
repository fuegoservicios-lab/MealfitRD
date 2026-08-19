// @ts-check
import { test, expect } from './fixtures';

/**
 * [P1-DETAIL-MODAL-FIT · 2026-08-10] La ficha de producto de /supermercado.
 *
 * POR QUÉ TIENE SU PROPIO FICHERO. El guard de móvil recorre las 10 rutas de
 * papel midiendo lo que se ve al cargar; esta ficha **solo existe tras un clic**,
 * así que ninguna de esas pasadas la tocaba nunca. Dos defectos vivieron ahí sin
 * que ningún test los viera:
 *
 *   1. A 375px y menos, el rango de precio salía en DOS líneas partido a media
 *      cifra («RD$55 –» / «RD$555»). No era falta de sitio —a 375 el precio pide
 *      184px y su fila da 290—: los flex items encogen por defecto, así que al no
 *      caber junto al sello «Verificado» el precio se comprimía y partía dentro
 *      de su caja en vez de que el sello bajara.
 *   2. La media se salía del marco: 331px dentro de un modal de 288 a 320px de
 *      viewport, 43 fuera. Causa: `grid-template-columns: 1fr`, que es
 *      `minmax(AUTO, 1fr)` — el mínimo automático es el contenido, así que la
 *      columna no bajaba de lo que medía su hijo.
 *
 * DATOS INYECTADOS, NO DE RED. El preview no tiene backend: sin interceptar,
 * `/api/supermarket/products` devuelve 500 y la página renderiza CERO tarjetas —
 * un test así pasaría en verde midiendo el vacío, que es exactamente el modo de
 * fallo que ya nos costó una verificación falsa. El fixture lleva a propósito un
 * rango de precio largo (RD$55 – RD$555), que es el caso que rompía.
 */

const CATEGORIA = 'Condimentos y especias';

const FIXTURE = {
  total: 3,
  categories: [CATEGORIA],
  products: [
    {
      id: 'fx-1', food_name: 'Canela en polvo', brand: null, presentation: 'Sobre 0.5 Oz',
      portion_label: 'Única', duration_label: '30 días', price_rd: 55, size_grams: 14,
      notes: null, category: CATEGORIA, master_food_name: 'Canela en polvo',
      image_url: null, description: 'Canela molida, presentación de sobre', is_verified: true, active: true,
    },
    {
      id: 'fx-2', food_name: 'Canela en polvo', brand: 'Badia', presentation: 'Frasco 2 Oz',
      portion_label: 'Única', duration_label: '30 días', price_rd: 555, size_grams: 56,
      notes: null, category: CATEGORIA, master_food_name: 'Canela en polvo',
      image_url: null, description: null, is_verified: true, active: true,
    },
    {
      id: 'fx-3', food_name: 'Canela en polvo', brand: 'Badia', presentation: 'Pote 2 Oz',
      portion_label: 'Única', duration_label: '30 días', price_rd: 105, size_grams: 56,
      notes: null, category: CATEGORIA, master_food_name: 'Canela en polvo',
      image_url: null, description: null, is_verified: true, active: true,
    },
  ],
};

// 375 es el ancho donde el defecto se veía; 320 es el suelo del contrato.
for (const width of [375, 320]) {
  test(`la ficha de producto encaja a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/supermarket/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) })
    );
    await page.goto('/supermercado');
    await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });

    // Sin esto, un fallo de la intercepción dejaría la página vacía y todo lo de
    // abajo pasaría por no encontrar nada que medir.
    const tarjetas = page.locator('[class*="cardPriceRow"]');
    await expect(tarjetas, 'P1-DETAIL-MODAL-FIT: no hay tarjetas — el guard mediría el vacío')
      .not.toHaveCount(0, { timeout: 10_000 });

    await page.getByText('Canela en polvo').first().click();
    await page.waitForTimeout(800);

    const r = await page.evaluate(() => {
      const modal = document.querySelector('[class*="modal"]');
      if (!modal) return { sinModal: true };
      const mb = modal.getBoundingClientRect();
      const fila = document.querySelector('[class*="detailPriceRow"]');
      const precio = fila
        ? [...fila.children].find(
            (e) => String(e.className).includes('detailPrice') && !String(e.className).includes('Row')
          )
        : null;
      const lh = precio ? parseFloat(getComputedStyle(precio).lineHeight) || 29 : 29;
      const fuera = [];
      modal.querySelectorAll('*').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.width < 8 || b.height < 4) return;
        if (getComputedStyle(el).position === 'fixed') return;
        if (b.right > mb.right + 1) {
          fuera.push({
            cls: String(el.className?.baseVal ?? el.className ?? '').slice(0, 28),
            exceso: Math.round(b.right - mb.right),
          });
        }
      });
      // [P1-MODAL-ABOVE-HEADER · 2026-08-10] El encabezado es `fixed` y estaba en
      // z-index 1000 contra los 80 del velo: en una pantalla corta el modal —que
      // se centra verticalmente— subía hasta debajo de la barra y perdía su borde
      // superior. Se comprueba el APILAMIENTO, no la distancia: si el velo está
      // por encima, ninguna altura futura del header puede volver a taparlo.
      const cab = document.querySelector('header');
      const overlay = modal.parentElement;
      const zDe = (el) => {
        const v = parseInt(getComputedStyle(el).zIndex, 10);
        return Number.isNaN(v) ? 0 : v;
      };

      return {
        precioTexto: precio ? precio.textContent.trim() : null,
        precioLineas: precio ? Math.round(precio.getBoundingClientRect().height / lh) : null,
        fuera,
        zVelo: overlay ? zDe(overlay) : null,
        zCabecera: cab ? zDe(cab) : null,
        modalTop: Math.round(mb.top),
        cabeceraBottom: cab ? Math.round(cab.getBoundingClientRect().bottom) : null,
      };
    });

    expect(r.sinModal, 'P1-DETAIL-MODAL-FIT: la ficha no llegó a abrirse').toBeFalsy();
    expect(
      r.precioLineas,
      `P1-DETAIL-MODAL-FIT: el rango de precio («${r.precioTexto}») se parte en ` +
        `${r.precioLineas} líneas a ${width}px. Un precio cortado a media ` +
        'cifra es ilegible: quien debe bajar de línea es el sello «Verificado».'
    ).toBe(1);
    expect(
      r.fuera,
      `P1-DETAIL-MODAL-FIT: hay contenido fuera del marco de la ficha. ` + JSON.stringify(r.fuera, null, 1)
    ).toEqual([]);
    expect(
      r.zVelo,
      `P1-MODAL-ABOVE-HEADER: el velo de la ficha (z=${r.zVelo}) no está por encima ` +
        `del encabezado fijo (z=${r.zCabecera}). Un modal toma la pantalla; con el ` +
        `header delante, en una pantalla corta le tapa el borde superior — a ` +
        `${width}px el modal arranca en y=${r.modalTop} y el header llega a ` +
        `y=${r.cabeceraBottom}.`
    ).toBeGreaterThan(r.zCabecera);
  });
}
