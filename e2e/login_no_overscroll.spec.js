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
    const m = await page.evaluate(() => ({
      scrollHeight: document.scrollingElement.scrollHeight,
      innerHeight: window.innerHeight,
      loginHeight: Math.round(document.querySelector('.mf-login').getBoundingClientRect().height),
    }));
    // El login mide min-height 100dvh; si el contenido cabe, documento === viewport.
    // Si no cabe (320×568), el documento mide lo que mide el login — nunca más.
    expect(m.scrollHeight, JSON.stringify(m)).toBeLessThanOrEqual(Math.max(m.innerHeight, m.loginHeight));
  });
}
