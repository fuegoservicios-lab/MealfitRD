// @ts-check
/**
 * [P2-I18N-E2E-DASHBOARD · 2026-08-22] El dashboard, medido en los cinco idiomas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ NO HIZO FALTA UN FIXTURE DE AUTENTICACIÓN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `P2-I18N-E2E-MONOLINGUE` cerró midiendo sólo `/login` y `/reset-password`, y dejó
 * escrito que el dashboard «necesita sesión, y este repo no tiene fixture de auth». Era
 * verdad a medias: el producto ya tiene modo INVITADO —«Probar sin cuenta»— y
 * `ProtectedRoute` lo deja pasar a `/dashboard`. Sembrar las mismas claves que pone ese
 * botón cuesta tres líneas y no falsifica ningún JWT.
 *
 * La primera versión igualmente rebotaba a `/assessment`: `hasCompletedAssessment` es
 * `!!planData` para un invitado, así que hace falta también un plan mínimo en
 * `localStorage`. No se falsifica uno «realista» — sólo lo justo para pasar el gate,
 * porque lo que se mide aquí es el CHROME, no el contenido.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LO QUE LA MEDICIÓN REFUTÓ, Y ESTA ES LA PARTE QUE IMPORTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `P2-I18N-NAV-DESBORDE` decía que «Garde-manger» parte en dos líneas la barra de
 * pestañas. El propio plan avisaba de que la cifra no estaba medida en producto. Ahora
 * que se puede medir, **son dos cosas distintas y las dos falsas**:
 *
 *   1. El rótulo del frigo en francés es **«Frigo»**, no «Garde-manger» — eso último es
 *      la traducción de «Despensa», que es otra pantalla. 31 px de ancho.
 *   2. La barra mide **65 px en los cinco idiomas**, y ninguna etiqueta envuelve. Medido
 *      con y SIN el `white-space: nowrap` que se añadió para arreglarlo: idéntico. Algún
 *      ancestro ya acotaba. El CSS era un no-op.
 *
 * El CSS se conserva —declarar la intención en la etiqueta es correcto y barato— pero su
 * comentario ya no afirma haber arreglado nada, y la protección real pasa a ser ESTE
 * fichero: un número que se puede volver a comprobar.
 *
 * Lo único que sí se recorta hoy es **«Cronologia»** (it-IT, 64 px en una celda de 64) y
 * sale con puntos suspensivos. Es aceptable a propósito: el icono de encima ya identifica
 * la pestaña, y conservar la geometría de la barra —que es por lo que el usuario se
 * orienta sin leer— vale más que las dos últimas letras.
 *
 * LO QUE SIGUE SIN CUBRIR: un invitado no tiene Nevera, Historial ni Recetas
 * persistidas, así que esas rutas siguen sin medirse. Lo que sí alcanza es el chrome, y
 * ahí vivía el gap.
 */
import { conIdiomaInvitado, expect } from './fixtures';

const IDIOMAS = ['es-DO', 'en-US', 'pt-BR', 'fr-FR', 'it-IT'];

/** 320px es el suelo del contrato del repo: un iPhone con Display Zoom. */
const ANCHO_SUELO = 320;

/**
 * Medido el 2026-08-22: 65px en los cinco idiomas. Se compara contra un TOPE y no contra
 * el valor exacto — la altura legítima puede cambiar por diseño (padding, safe-area), y
 * lo que este guard protege es que no crezca porque una etiqueta ENVOLVIÓ.
 *
 * El suelo de Apple HIG para una tab bar es ~49pt ≈ 65px (P3-TABBAR-HIG-COMPLIANCE), así
 * que 90 deja margen para un cambio de diseño y sigue muy por debajo de las dos líneas
 * (que sumarían ~12px más por etiqueta envuelta).
 */
const ALTO_MAXIMO = 90;

async function barraDePestanas(page) {
    return page.evaluate(() => {
        const etiquetas = [...document.querySelectorAll('[class*="tabLabel"]')];
        if (!etiquetas.length) return null;
        const barra = etiquetas[0].closest('nav, footer, [class*="bar"]');
        return {
            alto: barra ? Math.round(barra.getBoundingClientRect().height) : null,
            etiquetas: etiquetas.map((e) => {
                const r = e.getBoundingClientRect();
                const cs = getComputedStyle(e);
                const alturaLinea = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize);
                const celda = e.closest('button, a, [class*="tab"]');
                const c = celda ? celda.getBoundingClientRect() : r;
                return {
                    txt: (e.textContent || '').trim(),
                    lineas: Math.round(r.height / alturaLinea),
                    // Cuánto se sale la etiqueta de SU celda. Positivo = pisa a la vecina.
                    invade: +(r.right - c.right).toFixed(1),
                };
            }),
        };
    });
}

for (const locale of IDIOMAS) {
    const test = conIdiomaInvitado(locale);

    test.describe(`Dashboard en ${locale}`, () => {
        test(`el invitado llega al dashboard, no al formulario`, async ({ page }) => {
            await page.goto('/dashboard');
            await expect
                .poll(() => page.evaluate(() => location.pathname), { timeout: 15_000 })
                .toBe('/dashboard');
            // Si esto falla, TODO lo demás de este fichero está midiendo el formulario:
            // es el modo de fallo que tuvo la primera versión, y en silencio.
            await expect
                .poll(() => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
                .toBe(locale);
        });

        test(`ninguna pestaña envuelve a ${ANCHO_SUELO}px`, async ({ page }) => {
            await page.setViewportSize({ width: ANCHO_SUELO, height: 844 });
            await page.goto('/dashboard');
            await expect
                .poll(() => page.evaluate(() => location.pathname), { timeout: 15_000 })
                .toBe('/dashboard');
            // Esperar a que la barra EXISTA, no un tiempo fijo. Con `waitForTimeout` el
            // test pasaba en serie y perdía 3 de 10 en paralelo: bajo carga el chunk del
            // dashboard monta más tarde y se medía un DOM sin barra. Un tiempo que gana
            // «casi siempre» es una carrera, y en CI la máquina va más cargada que aquí.
            await page.locator('[class*="tabLabel"]').first().waitFor({ timeout: 15_000 });
            // Y las tipografías antes de medir anchos: con la de reserva, más ancha, una
            // etiqueta envuelve de forma transitoria.
            await page.evaluate(() => document.fonts?.ready.then(() => true));

            const barra = await barraDePestanas(page);
            expect(barra, 'no encontré la barra de pestañas — ¿cambió `tabLabel`?').not.toBeNull();

            const envueltas = barra.etiquetas.filter((e) => e.lineas > 1);
            expect(
                envueltas,
                `P2-I18N-NAV-DESBORDE: ${envueltas.length} etiqueta(s) en dos líneas en `
                + `${locale}. Eso empuja la altura de la barra y desalinea los cinco `
                + `iconos, que es por lo que el usuario se orienta sin leer. `
                + JSON.stringify(envueltas),
            ).toEqual([]);

            const invasoras = barra.etiquetas.filter((e) => e.invade > 0.5);
            expect(
                invasoras,
                `${invasoras.length} etiqueta(s) se salen de su celda en ${locale} y pisan `
                + `a la vecina. ` + JSON.stringify(invasoras),
            ).toEqual([]);

            expect(
                barra.alto,
                `la barra mide ${barra.alto}px en ${locale}. Medido el 2026-08-22: 65px en `
                + `los cinco. Un salto por encima de ${ALTO_MAXIMO} casi siempre significa `
                + `que una etiqueta envolvió.`,
            ).toBeLessThanOrEqual(ALTO_MAXIMO);
        });
    });
}
