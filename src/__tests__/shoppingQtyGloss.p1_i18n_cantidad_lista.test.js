/**
 * [P1-I18N-CANTIDAD-LISTA · 2026-08-22] El nombre del alimento era bilingüe y la CANTIDAD
 * seguía siendo prosa española.
 *
 * MEDIDO sobre las listas reales de 24 planes de producción: **811 de 898 ítems (90,3 %)**
 * llevan sustantivo de envase o prosa española en `display_qty`. Términos más frecuentes:
 * `paquete` (196), `uds` (158), `funda` (98), `alcanza`/`días`/`recompra` (85 cada uno).
 *
 * Lo que lee un francés en el PDF que se lleva al súper:
 *
 *     Black beans (Habichuelas rojas) — 1 paquete (800gr · Genérico) · alcanza ~6 de 7 días — recompra
 *
 * Sabe QUÉ comprar y no CUÁNTO, en qué presentación ni para cuántos días.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MITAD DE ESTE FICHERO ES LA FRONTERA, Y ES LA MITAD QUE IMPORTA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `display_qty` vive al lado de `market_unit` y `market_qty_numeric`, que son DATO: los usa
 * `/restock` para construir las filas de `user_inventory`. Y hay un camino por el que el
 * display SÍ toca el dato — `Dashboard.jsx` cae a `parseMarketQty(ing.display_qty)` cuando
 * `resolveShopQty(ing)` devuelve 0.
 *
 * Por eso los tests de abajo comprueban, además de que traduzca:
 *   · que NUNCA se toca lo de dentro del paréntesis (marcas y tamaños reales: traducir «Lb»
 *     en «Selecto 1 Lb · Wala» falsificaría la etiqueta y el usuario no encontraría el
 *     producto en el estante);
 *   · que el NÚMERO INICIAL sobrevive intacto, que es lo único que `parseMarketQty` lee;
 *   · que las unidades de peso/volumen (`lb`, `g`, `oz`, `ml`) NO se traducen: son símbolos
 *     internacionales y «lbs» es lo que dice el estante en RD.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { loadLocale, t } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';
import { glossShoppingQty, parseMarketQty } from '../utils/shoppingHelpers';

afterAll(async () => { await loadLocale(DEFAULT_LOCALE); });

describe('[P1-I18N-CANTIDAD-LISTA] la cantidad de la lista sigue el idioma', () => {
    beforeEach(async () => { await loadLocale(DEFAULT_LOCALE); });

    it('en es-DO no cambia nada', () => {
        const entrada = '1 paquete (800gr · Genérico) · alcanza ~6 de 7 días — recompra';
        expect(glossShoppingQty(entrada, t)).toBe(entrada);
    });

    it('traduce el envase y la cláusula de cobertura en en-US', async () => {
        await loadLocale('en-US');
        expect(t('Guardar')).not.toBe('Guardar');   // testigo: el catálogo cargó

        const salida = glossShoppingQty('1 paquete (800gr · Genérico) · alcanza ~6 de 7 días — recompra', t);
        expect(salida).toContain('1 pack');
        expect(salida).toContain('covers ~6 of 7 days');
        expect(salida).not.toMatch(/paquete|alcanza|días|recompra/);
    });

    it('preserva la marca y el tamaño REALES de dentro del paréntesis', async () => {
        await loadLocale('fr-FR');
        const salida = glossShoppingQty('2 fundas (Selecto 1 Lb · Wala c/u)', t);
        // El envase sí; la etiqueta del producto, jamás.
        expect(salida).toContain('sachets');
        expect(salida).toContain('Selecto 1 Lb');
        expect(salida).toContain('Wala');
        expect(salida).not.toMatch(/livre|Livre/);   // «Lb» NO se traduce
    });

    it('NO traduce las unidades de peso y volumen', async () => {
        await loadLocale('en-US');
        for (const entrada of ['1 lb', '2 lbs', '500 g', '250 ml', '16 oz']) {
            expect(glossShoppingQty(entrada, t)).toBe(entrada);
        }
    });

    it('el NÚMERO INICIAL sobrevive — es lo único que lee parseMarketQty', async () => {
        await loadLocale('it-IT');
        for (const entrada of ['1 paquete (800gr)', '2 fundas', '9 potes (16 oz c/u)', '1 Mazo']) {
            const salida = glossShoppingQty(entrada, t);
            expect(parseMarketQty(salida), `«${entrada}» → «${salida}»`)
                .toBe(parseMarketQty(entrada));
            expect(parseMarketQty(salida)).toBeGreaterThan(0);
        }
    });

    it('preserva la mayúscula inicial del envase', async () => {
        await loadLocale('en-US');
        expect(glossShoppingQty('1 Mazo', t)).toBe('1 Bunch');
        expect(glossShoppingQty('1 mazo', t)).toBe('1 bunch');
    });

    it('traduce la segunda forma de cláusula de cobertura', async () => {
        await loadLocale('pt-BR');
        const salida = glossShoppingQty('1 pote (1.96 kg) · alcanza ~14 días — no recompres cada semana', t);
        expect(salida).toContain('cobre ~14 dias');
        expect(salida).not.toContain('alcanza');
    });

    it.each(['en-US', 'pt-BR', 'fr-FR', 'it-IT'])('en %s el envase sale EXACTAMENTE como dice el catálogo', async (loc) => {
        await loadLocale(loc);
        // Se compara contra `t(envase)`, NO contra «que no quede nada en español».
        //
        // La primera versión de este test asertaba lo segundo y fallaba con «1 lata de
        // 400 g» en pt-BR — porque «lata» se dice IGUAL en portugués. Es el falso positivo
        // de «valor idéntico al original»: una traducción correcta que coincide con la
        // palabra de partida. Prohibir la coincidencia habría obligado a inventar un
        // sinónimo peor para hacer feliz al guard.
        const muestras = [
            ['1 paquete (800gr · Genérico)', 'paquete'],
            ['2 fundas (Selecto 1 Lb · Wala c/u)', 'fundas'],
            ['1 Cabeza (~400g)', 'cabeza'],
            ['1 Mazo', 'mazo'],
            ['1 carton (Tetra 400 gr · Rica)', 'cartón'],
            ['3 sobres', 'sobres'],
            ['1 lata de 400 g', 'lata'],
        ];
        for (const [entrada, envaseEs] of muestras) {
            const salida = glossShoppingQty(entrada, t);
            const esperado = t(envaseEs);
            expect(salida.toLowerCase(), `«${entrada}» → «${salida}» con ${loc}`)
                .toContain(esperado.toLowerCase());
        }
    });

    it('degrada al español sin romper nada', () => {
        // Sin `t`, con basura, o con una `t` que lanza: la cantidad SIEMPRE sale.
        const entrada = '1 paquete (800gr)';
        expect(glossShoppingQty(entrada, undefined)).toBe(entrada);
        expect(glossShoppingQty(entrada, null)).toBe(entrada);
        expect(glossShoppingQty(entrada, () => { throw new Error('catálogo roto'); })).toBe(entrada);
        expect(glossShoppingQty(null, t)).toBe(null);
        expect(glossShoppingQty('', t)).toBe('');
        expect(glossShoppingQty(42, t)).toBe(42);
    });

    it('una cadena que no reconoce vuelve intacta', async () => {
        await loadLocale('fr-FR');
        for (const entrada of ['Al gusto', '1 zanahoria mediana', 'None']) {
            expect(glossShoppingQty(entrada, t)).toBe(entrada);
        }
    });
});
