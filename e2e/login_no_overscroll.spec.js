// @ts-check
import { test, expect } from './fixtures';

/**
 * [P1-LOGIN-GLOW-OVERSCROLL · 2026-08-22] En el iPhone (PWA de pantalla de inicio)
 * el login «sobrepasaba el borde de abajo»: al llegar al final había 162 px de página
 * vacía bajo el contenido. No era el rebote de iOS — era scroll REAL, medido:
 * `scrollHeight` 1006 contra un viewport de 844.
 *
 * Causa: el glow decorativo `.mf-glow--b` (absolute, `bottom: -160px`) cuelga por
 * debajo de `.mf-login`, y el bloque móvil (P1-LOGIN-KEYBOARD) dejó `overflow-y:
 * visible` creyendo que `overflow-x: clip` «seguía recortando los glows»: solo los
 * recortaba de lado. `overflow: clip` en los dos ejes los recorta sin crear un
 * contenedor de scroll, que es lo único que ese bloque necesita evitar.
 *
 * QUÉ MIDE: el documento del login no es más alto que el viewport en ninguno de los
 * anchos de contrato. Lo mide un motor de render, no un parser: la altura de un
 * glow posicionado no se ve en el CSS fuente.
 */
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

for (const vp of VIEWPORTS) {
  test(`login a ${vp.width}×${vp.height}: sin scroll de más por debajo del contenido`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('.mf-login');
    const m = await page.evaluate(() => {
      const l = document.querySelector('.mf-login');
      return {
        scrollHeight: document.scrollingElement.scrollHeight,
        innerHeight: window.innerHeight,
        bodyOverflow: getComputedStyle(document.body).overflowY,
        loginScrollH: l.scrollHeight, loginClientH: l.clientHeight,
        loginScrollW: l.scrollWidth, loginClientW: l.clientWidth,
        formContentH: document.querySelector('.mf-form').scrollHeight,
      };
    });
    // [P1-LOGIN-NO-DOC-SCROLL] El DOCUMENTO nunca scrollea en el login (iOS rebota el
    // documento aunque el contenido quepa exacto; un contenedor que cabe, no).
    expect(m.bodyOverflow, JSON.stringify(m)).toBe('hidden');
    expect(m.scrollHeight, JSON.stringify(m)).toBe(m.innerHeight);
    // El login es su propio scroller: sin recorrido horizontal nunca, y sin recorrido
    // vertical salvo que el CONTENIDO del formulario de verdad no quepa (iPhone SE).
    expect(m.loginScrollW, JSON.stringify(m)).toBeLessThanOrEqual(m.loginClientW);
    expect(m.loginScrollH, JSON.stringify(m)).toBeLessThanOrEqual(Math.max(m.loginClientH, m.formContentH));
  });
}
