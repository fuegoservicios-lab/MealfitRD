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
        // [P3-I18N-ENVASES-DISTINTOS-QUE-COLAPSAN] «fundas» es la bolsa («sacs»); «sachets» es «sobres».
        expect(salida).toContain('sacs');
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
        // «Al gusto» era el primer ejemplo de esta lista; desde
        // P3-I18N-SHOPPING-HELPERS-RELLENOS SÍ se reconoce (tenía traducción y nadie la pedía).
        for (const entrada of ['1 zanahoria mediana', 'None', 'A ojo']) {
            expect(glossShoppingQty(entrada, t)).toBe(entrada);
        }
    });
});

describe('[P2-I18N-GENERICO-SE-IMPRIME-EN-ESPANOL] «Genérico» no es una marca', () => {
    // [P2-I18N-GENERICO-SE-IMPRIME-EN-ESPANOL · 2026-08-23] La regla «lo de dentro del
    // paréntesis no se toca» existe para las MARCAS («Wala», «La Sanjuanera»), que son
    // nombres propios. «Genérico» no lo es: es el placeholder que los dos lados (backend
    // y picker de marcas) escriben cuando NO hay marca, y lo escriben en el DATO. Medido
    // contra producción: 259 de 1.658 ítems de listas vivas lo llevan. Se traduce al
    // IMPRIMIR, como el envase y el «c/u» — el dato no se toca.
    afterAll(async () => { await loadLocale(DEFAULT_LOCALE); });

    it('EL CASO: «Genérico» dentro del paréntesis se traduce', async () => {
        await loadLocale('fr-FR');
        const salida = glossShoppingQty('1 paquete (800 gr · Genérico)', t);
        expect(salida, 'la palabra siguió en español').not.toContain('Genérico');
        expect(salida).toContain('800 gr');
    });

    it('una marca REAL del mismo paréntesis sigue intacta', async () => {
        await loadLocale('fr-FR');
        const salida = glossShoppingQty('1 paquete (800 gr · La Sanjuanera)', t);
        expect(salida).toContain('La Sanjuanera');
    });

    it('en es-DO no cambia nada', async () => {
        await loadLocale(DEFAULT_LOCALE);
        expect(glossShoppingQty('1 paquete (800 gr · Genérico)', t)).toBe('1 paquete (800 gr · Genérico)');
    });
});

describe('[P2-I18N-CARTON-EN-FRANCES-DEJA-UNA-PREPOSICION-COLGANDO]', () => {
    // «cartón» → «boîte de» pensaba en «boîte de lait», pero el envase va SOLO y seguido
    // del paréntesis: el PDF imprimía «1 boîte de (1 Lt · Wala)». Un envase se traduce por
    // un sustantivo, nunca por un sintagma que espere complemento.
    afterAll(async () => { await loadLocale(DEFAULT_LOCALE); });
    it('el envase traducido no termina en preposición', async () => {
        await loadLocale('fr-FR');
        const salida = glossShoppingQty('1 cartón (1 Lt · Wala)', t);
        expect(salida).not.toMatch(/\bde\s*\(/);
        expect(salida).toContain('(1 Lt · Wala)');
    });
});

describe('[P2-I18N-UNIDADES-DE-ENVASE-CRUDAS-EN-NEVERA-Y-DIARIO] glossUnitWord', () => {
    // La tabla de envases existía para el PDF; la Nevera y el diario pintaban `item.unit`
    // crudo con la traducción al lado. Se traduce al PINTAR; el dato no se toca.
    afterAll(async () => { await loadLocale(DEFAULT_LOCALE); });
    it('traduce un envase suelto', async () => {
        await loadLocale('fr-FR');
        const { glossUnitWord } = await import('../utils/shoppingHelpers');
        expect(glossUnitWord('funda', t)).not.toBe('funda');
        expect(glossUnitWord('Funda', t)[0]).toMatch(/[A-Z]/);   // conserva la caja
    });
    it('NO traduce las unidades de magnitud ni lo que no conoce', async () => {
        await loadLocale('fr-FR');
        const { glossUnitWord } = await import('../utils/shoppingHelpers');
        expect(glossUnitWord('g', t)).toBe('g');
        expect(glossUnitWord('kg', t)).toBe('kg');
        expect(glossUnitWord('xyz', t)).toBe('xyz');
        expect(glossUnitWord('', t)).toBe('');
        expect(glossUnitWord(null, t)).toBe(null);
    });
    it('en es-DO devuelve la palabra tal cual', async () => {
        await loadLocale(DEFAULT_LOCALE);
        const { glossUnitWord } = await import('../utils/shoppingHelpers');
        expect(glossUnitWord('funda', t)).toBe('funda');
    });
});

// [P3-I18N-SHOPPING-HELPERS-RELLENOS · 2026-08-23] Los rellenos que `shoppingHelpers`
// fabrica en español («Al gusto», «Ingrediente», «Desconocido») tenían traducción en los
// cuatro catálogos y nadie la pedía. Se quedan en español en el DATO (claves de mapa, viajan
// al backend) y se glosan al pintar.
describe('[P3-I18N-SHOPPING-HELPERS-RELLENOS] rellenos al pintar', () => {
    it('«Al gusto» se glosa en glossShoppingQty (y sus variantes de caja)', async () => {
        const { glossShoppingQty } = await import('../utils/shoppingHelpers');
        const t = (k) => ({ 'Al gusto': 'Selon le goût' })[k] || k;
        expect(glossShoppingQty('Al gusto', t)).toBe('Selon le goût');
        expect(glossShoppingQty('al gusto ', t)).toBe('Selon le goût');
        expect(glossShoppingQty('2 lb', t)).toBe('2 lb');
    });

    it('«Ingrediente» y «Desconocido» se glosan en glossShoppingName; un nombre real no se toca', async () => {
        const { glossShoppingName } = await import('../utils/shoppingHelpers');
        const t = (k) => ({ Ingrediente: 'Ingrédient', Desconocido: 'Inconnu' })[k] || k;
        expect(glossShoppingName('Ingrediente', t)).toBe('Ingrédient');
        expect(glossShoppingName('desconocido', t)).toBe('Inconnu');
        expect(glossShoppingName('Pollo', t)).toBe('Pollo');
        expect(glossShoppingName('Pollo')).toBe('Pollo');
        expect(glossShoppingName(undefined, t)).toBe(undefined);
    });

    it('el dato NO cambia: calculateAllPlanIngredients sigue fabricando el español', async () => {
        const { calculateAllPlanIngredients } = await import('../utils/shoppingHelpers');
        const plan = { days: [{ meals: [{ name: 'X', ingredients: [{ name: '' }] }] }] };
        const out = calculateAllPlanIngredients(plan, false, []);
        const json = JSON.stringify(out);
        expect(json).toMatch(/Al gusto|Ingrediente|Desconocido/);
    });
});

// [P3-I18N-ENVASES-DISTINTOS-QUE-COLAPSAN · 2026-08-23] «funda» (la bolsa) y «sobre» (el
// sachet) eran ambas «sachet» en francés: dos envases distintos de la lista salían con la
// misma palabra, y el usuario no sabía si comprar una bolsa o un sobrecito. Se distinguen
// en los cuatro catálogos; este guard mide los pares en los que el español distingue.
describe('[P3-I18N-ENVASES-DISTINTOS-QUE-COLAPSAN] envases que el español distingue', () => {
    const PARES = [['funda', 'sobre'], ['fundas', 'sobres'], ['fundita', 'sobrecito'], ['funditas', 'sobrecitos']];
    for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
        it(`${loc}: funda≠sobre y fundita≠sobrecito`, async () => {
            const cat = (await import(`../i18n/locales/${loc}.json`)).default;
            for (const [a, b] of PARES) {
                expect(cat[a], `${loc} sin «${a}»`).toBeTruthy();
                expect(cat[b], `${loc} sin «${b}»`).toBeTruthy();
                expect(cat[a].toLowerCase(), `${loc}: «${a}» y «${b}» colapsan en «${cat[a]}»`).not.toBe(cat[b].toLowerCase());
            }
        });
    }
});
