// [P1-PLAN-LOTE-703 · 2026-09-28] (G85) El separador decimal de la cantidad métrica de la lista sigue al PAÍS.
//
// La cantidad métrica («1,4 kg») la produce una decisión de país (ES/MX/CO pasan a métrico). El separador lo decidía
// sólo el idioma: un español con la app en es-DO —lo que le da la autodetección, porque es-ES cae en es-DO— veía
// «1.4 kg», y el PDF estropeaba un valor que el motor había escrito bien. Ahora el formato se toma con el idioma del
// usuario y la región de su país (`formatRegionFor`: es + ES → es-ES). Sin país (sistema de países apagado), igual que antes.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatRegionFor } from '../utils/shoppingHelpers';
import { setPaisDeLectura } from '../utils/paisDelUsuario';

describe('lote 703 — formatRegionFor', () => {
    it('compone el idioma del usuario con la región de su país', () => {
        expect(formatRegionFor('ES', 'es-DO')).toBe('es-ES');
        expect(formatRegionFor('CO', 'en-US')).toBe('en-CO');
        expect(formatRegionFor('mx', 'fr-FR')).toBe('fr-MX');
    });

    it('sin país válido deja el idioma tal cual', () => {
        expect(formatRegionFor(null, 'fr-FR')).toBe('fr-FR');
        expect(formatRegionFor('España', 'es-DO')).toBe('es-DO');
        expect(formatRegionFor('ES', '')).toBe('');
    });
});

describe('lote 703 — la cantidad de la lista con el separador del país', () => {
    beforeEach(() => { localStorage.clear(); });
    afterEach(() => setPaisDeLectura(null));

    it('un español con la app en es-DO ve la coma que escribió el motor', async () => {
        const { glossShoppingQty } = await import('../utils/shoppingHelpers');
        const { t } = await import('../i18n');
        setPaisDeLectura('ES');
        expect(glossShoppingQty('1,4 kg', t)).toBe('1,4 kg');
        setPaisDeLectura('CO');
        expect(glossShoppingQty('1,4 kg', t)).toBe('1,4 kg');
    });

    it('México y RD escriben punto', async () => {
        const { glossShoppingQty } = await import('../utils/shoppingHelpers');
        const { t } = await import('../i18n');
        setPaisDeLectura('MX');
        expect(glossShoppingQty('1,4 kg', t)).toBe('1.4 kg');
        setPaisDeLectura('DO');
        expect(glossShoppingQty('1,4 kg', t)).toBe('1.4 kg');
    });

    it('sin país, como antes: el separador del idioma', async () => {
        const { glossShoppingQty } = await import('../utils/shoppingHelpers');
        const { t } = await import('../i18n');
        expect(glossShoppingQty('1,4 kg', t)).toBe('1.4 kg');
    });
});
