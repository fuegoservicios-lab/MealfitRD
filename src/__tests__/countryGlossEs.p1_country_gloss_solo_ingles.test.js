import { describe, expect, it } from 'vitest';
import { buildGlossIndex, glossShoppingItemName } from '../utils/shoppingHelpers';


describe('[P1-COUNTRY-GLOSS-SOLO-INGLES] gloss español por país', () => {
    it.each(['ES', 'MX', 'CO', 'PR'])('%s con locale es-DO muestra el gloss panhispánico', (country) => {
        expect(
            glossShoppingItemName('Lechosa', 'Papaya', 'es-DO', null, country, 'papaya'),
        ).toBe('Lechosa (papaya)');
    });

    it('DO conserva byte-idéntico el identificador canónico', () => {
        expect(
            glossShoppingItemName('Lechosa', 'Papaya', 'es-DO', null, 'DO', 'papaya'),
        ).toBe('Lechosa');
    });

    // [P1-GLOSS-MAPUEY-DO · 2026-09-07] La excepción, y por qué NO es una relajación de la regla.
    //
    // Los 22 glosses de agosto van en una dirección: explicarle un dominicanismo a un extranjero.
    // El del mapuey va en la contraria — en RD la gente dice «ñame» y «mapuey» suena a otra cosa
    // (83 menciones en 12 de 95 planes vivos), así que aquí el nombre canónico es el RARO.
    it('DO SÍ ve el gloss cuando va en dirección inversa (mapuey)', () => {
        expect(
            glossShoppingItemName('Mapuey', 'Mapuey yam', 'es-DO', null, 'DO', 'ñame indio'),
        ).toBe('Mapuey (ñame indio)');
    });

    it('la excepción es por ALIMENTO, no una puerta abierta para DO', () => {
        for (const [name, gloss] of [['Auyama', 'calabaza'], ['Chinola', 'maracuyá'],
                                     ['Guineo', 'banana'], ['Recao', 'culantro']]) {
            expect(glossShoppingItemName(name, null, 'es-DO', null, 'DO', gloss)).toBe(name);
        }
    });

    it('el mapuey sigue glosado para los cuatro mercados beta', () => {
        expect(
            glossShoppingItemName('Mapuey', 'Mapuey yam', 'es-DO', null, 'ES', 'ñame indio'),
        ).toBe('Mapuey (ñame indio)');
    });

    it('un locale inglés conserva el gloss inglés aunque el país sea ES', () => {
        expect(
            glossShoppingItemName('Lechosa', 'Papaya', 'en-US', null, 'ES', 'papaya'),
        ).toBe('Papaya (Lechosa)');
    });

    it('el catálogo sirve de respaldo para planes viejos sin campo embebido', () => {
        const index = buildGlossIndex([{ name: 'Lechosa', name_en: 'Papaya', gloss_es: 'papaya' }]);
        expect(glossShoppingItemName('Lechosa', null, 'es-DO', index, 'ES')).toBe('Lechosa (papaya)');
    });

    it('la caché persistida conserva gloss_es sin guardar el catálogo entero', async () => {
        const cache = await import('../utils/pantryCache');
        localStorage.clear();
        cache.setCachedMasterList([{ name: 'Lechosa', name_en: 'Papaya', gloss_es: 'papaya', kcal: 42 }]);
        expect(cache.getCachedGlossIndex().get('lechosa')).toEqual({ name_en: 'Papaya', gloss_es: 'papaya' });
        expect(localStorage.getItem(cache.GLOSS_INDEX_LS_KEY)).not.toContain('kcal');
    });

    it('Dashboard pasa país y display_gloss_es al render display-only', async () => {
        const { readFile } = await import('node:fs/promises');
        const source = await readFile(`${process.cwd()}/src/pages/Dashboard.jsx`, 'utf8');
        expect(source).toContain('formData?.country, item.item_ref?.display_gloss_es');
    });
});
