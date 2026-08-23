/**
 * [P2-I18N-PDF-CATEGORIAS + P2-I18N-PDF-LEYENDA-UD + P3-I18N-PDF-GLOSS-TAUTOLOGICO ·
 * 2026-08-22] Conducta de lo que le quedaba en español a la lista del PDF.
 *
 * Los guards de PARIDAD contra el backend viven en `test_p2_i18n_pdf_categorias.py` (el copy y el
 * vocabulario nacen ahí). Aquí se prueba lo que esos no pueden ver: que la sustitución hace
 * algo, que degrada a español en vez de romper, y sobre todo que el valor CANÓNICO sigue
 * intacto — porque la categoría no es sólo un rótulo, es la clave de agrupación.
 */
import { describe, it, expect } from 'vitest';
import {
    glossShoppingCategory,
    glossShoppingItemName,
    glossShoppingQty,
    CATEGORIAS_DE_LISTA_CLAVES,
} from '../utils/shoppingHelpers';

const tFalsa = (clave) => `«${clave}»`;

describe('glossShoppingCategory', () => {
    it('traduce las categorías que el backend imprime de verdad', () => {
        // Las 8 grafías medidas sobre los 43 planes vivos.
        for (const cat of ['PROTEÍNAS', 'VEGETALES', 'DESPENSA', 'FRUTAS', 'LÁCTEOS', 'VÍVERES']) {
            expect(glossShoppingCategory(cat, tFalsa)).toBe(`«${cat}»`);
        }
        expect(glossShoppingCategory('🚨 Compra Urgente', tFalsa)).toBe('«🚨 Compra Urgente»');
    });

    it('resuelve las dos grafías que conviven en producción', () => {
        // 750 ítems traen `VEGETALES` y 2 traen `Vegetales`, de las filas beta.
        expect(glossShoppingCategory('Vegetales', tFalsa)).toBe(glossShoppingCategory('VEGETALES', tFalsa));
        expect(glossShoppingCategory('Proteínas', tFalsa)).toBe(glossShoppingCategory('PROTEÍNAS', tFalsa));
        // …y sin la tilde, que es como llega el fallback NLP del backend en algunos casos.
        expect(glossShoppingCategory('PROTEINAS', tFalsa)).toBe('«PROTEÍNAS»');
    });

    it('un pasillo nuevo del backend pasa TAL CUAL, no desaparece', () => {
        expect(glossShoppingCategory('EMBUTIDOS', tFalsa)).toBe('EMBUTIDOS');
    });

    it('degrada a español: sin t, con basura, y con una t que lanza', () => {
        expect(glossShoppingCategory('DESPENSA', undefined)).toBe('DESPENSA');
        expect(glossShoppingCategory(null, tFalsa)).toBe(null);
        expect(glossShoppingCategory('', tFalsa)).toBe('');
        expect(glossShoppingCategory('DESPENSA', () => { throw new Error('roto'); })).toBe('DESPENSA');
    });

    it('en es-DO la categoría sale idéntica', () => {
        for (const clave of CATEGORIAS_DE_LISTA_CLAVES) {
            expect(glossShoppingCategory(clave, (s) => s)).toBe(clave);
        }
    });
});

describe('glossShoppingQty — la abreviatura de unidad', () => {
    it('traduce «Ud.»/«Uds.», que es la 3ª forma más frecuente de la flota', () => {
        // El barrido de envases captura sólo letras, así que sin su propio pase la
        // abreviatura --524 de 3.558 ítems-- se quedaba en español en los 4 idiomas.
        expect(glossShoppingQty('1 Ud.', tFalsa)).toBe('1 «Ud.»');
        expect(glossShoppingQty('3 Uds. (~1.3 lbs total)', tFalsa)).toBe('3 «Uds.» (~1.3 lbs total)');
    });

    it('no toca el número inicial, que es lo que lee parseMarketQty', () => {
        expect(glossShoppingQty('3 Uds.', tFalsa).startsWith('3 ')).toBe(true);
        expect(glossShoppingQty('1 Ud. (~2 lbs)', tFalsa).startsWith('1 ')).toBe(true);
    });

    it('dentro del paréntesis glosa la «Ud.» (es una unidad) pero NO la marca ni el tamaño', () => {
        // [P3-I18N-UD-DENTRO-DEL-PARENTESIS · 2026-08-23] Este caso decía «NO alcanza una Ud.
        // dentro del paréntesis» y era justo el defecto: el PDF explicaba «U. = unité» y seguía
        // imprimiendo «Ud.» en el 11 % de sus líneas. La marca y el tamaño siguen intactos.
        const dentro = '2 paquetes (Selecto 1 Ud. · Wala)';
        const out = glossShoppingQty(dentro, tFalsa);
        expect(out).toContain('Selecto 1 «Ud.»');
        expect(out).toContain('Wala');
    });

    it('traduce los cuatro envases que el primer espejo se dejó fuera', () => {
        for (const [entrada, esperado] of [
            ['2 dientes de ajo', '2 «dientes» de ajo'],
            ['1 malla', '1 «malla»'],
            ['1 bandeja', '1 «bandeja»'],
            ['3 tazas', '3 «tazas»'],
        ]) {
            expect(glossShoppingQty(entrada, tFalsa)).toBe(esperado);
        }
    });
});

describe('glossShoppingItemName — el gloss tautológico', () => {
    it('no repite la misma palabra dos veces', () => {
        expect(glossShoppingItemName('Cilantro', 'Cilantro', 'fr-FR')).toBe('Cilantro');
        expect(glossShoppingItemName('Quinoa', 'Quinoa', 'en-US')).toBe('Quinoa');
    });

    it('tampoco cuando la única diferencia es una tilde (17 de las 23 filas)', () => {
        expect(glossShoppingItemName('Salmón', 'Salmon', 'fr-FR')).toBe('Salmón');
        expect(glossShoppingItemName('Melón', 'Melon', 'pt-BR')).toBe('Melón');
        expect(glossShoppingItemName('Kétchup', 'Ketchup', 'it-IT')).toBe('Kétchup');
        expect(glossShoppingItemName('Jícama', 'Jicama', 'en-US')).toBe('Jícama');
    });

    it('cuando el gloss SÍ aporta, sigue siendo bilingüe', () => {
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', 'fr-FR')).toBe(
            'Black beans (Habichuelas negras)',
        );
    });

    it('en es-DO no cambia nada', () => {
        expect(glossShoppingItemName('Salmón', 'Salmon', 'es-DO')).toBe('Salmón');
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', 'es-DO')).toBe(
            'Habichuelas negras',
        );
    });
});
