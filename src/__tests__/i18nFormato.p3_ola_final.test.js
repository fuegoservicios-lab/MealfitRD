/**
 * [P3-I18N-METRICA-COMA-CLAVADA + P3-I18N-CHECKOUT-MONEDA-CLAVADA + P3-I18N-HORA-COACH-12H]
 * La mitad de CONDUCTA de la última ola de i18n.
 *
 * Los guards de `backend/tests/test_p3_i18n_metrica_coma_clavada.py` leen la FUENTE: dicen
 * que el código llama a quien debe. Este fichero dice qué SALE, que es la pregunta que un
 * parser no puede contestar — y es justo donde vivía el defecto de esta ola: el separador
 * decimal no estaba «clavado para los otros idiomas», estaba clavado y además equivocado en
 * el idioma base.
 *
 * Se cargan catálogos REALES (no stubs) porque lo que se mide es `Intl`, no la traducción.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const cargar = async (locale) => {
    localStorage.setItem('mealfit_locale', locale);
    const mod = await import('../i18n');
    if (locale !== 'es-DO') {
        await mod.loadLocale(locale);
    }
    return mod;
};

describe('el importe del checkout se escribe en el idioma activo', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(async () => {
        const mod = await import('../i18n');
        await mod.loadLocale?.('es-DO');
    });

    it('es-DO sale BYTE-IDÉNTICO a lo que se pintaba a mano', async () => {
        const { formatCurrency } = await cargar('es-DO');
        expect(
            formatCurrency(25),
            'el idioma base cambió de aspecto. Todo el motor de i18n descansa en que la '
            + 'base no se mueve: si esto cambia, el cambio es visible para 19 de 19 usuarios',
        ).toBe('US$25.00');
    });

    it('cada idioma pone su propia convención — símbolo, posición y separador', async () => {
        // Los espacios se normalizan antes de comparar: `Intl` separa el símbolo de la
        // cifra con un espacio DURO (U+00A0), no con el normal. Un `toBe` sobre la cadena
        // cruda ancla un carácter invisible — la primera versión de este test falló con
        // «expected 'US$ 25,00' to be 'US$ 25,00'», dos cadenas idénticas en pantalla.
        // Lo que el test afirma es el símbolo, su POSICIÓN y el separador; el tipo de
        // espacio lo decide CLDR y no es nuestro contrato.
        const norm = (x) => x.replace(/\s/gu, ' ');
        for (const [locale, esperado] of [
            ['en-US', '$25.00'],
            ['pt-BR', 'US$ 25,00'],
            ['fr-FR', '25,00 $US'],
            ['it-IT', '25,00 USD'],
        ]) {
            const { formatCurrency } = await cargar(locale);
            expect(norm(formatCurrency(25)), `${locale}`).toBe(esperado);
        }
    });

    it('un valor no numérico devuelve cadena vacía, no «NaN» en el modal de pago', async () => {
        const { formatCurrency } = await cargar('es-DO');
        expect(formatCurrency(undefined)).toBe('');
        expect(formatCurrency('no soy un precio')).toBe('');
    });
});

describe('la cantidad de la lista lleva el separador decimal del idioma', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    /** El backend escribe SIEMPRE con coma; eso es el dato de entrada, no una hipótesis. */
    const DEL_BACKEND = '1,4 kg';

    it('es-DO usa PUNTO — que es lo que este gap descubrió', async () => {
        await cargar('es-DO');
        const { glossShoppingQty } = await import('../utils/shoppingHelpers');
        const { t } = await import('../i18n');
        expect(
            glossShoppingQty(DEL_BACKEND, t),
            'la República Dominicana escribe el decimal como Estados Unidos. El comentario '
            + 'del backend que justifica la coma con «la lista se lee en español» confundió '
            + '«español» con «España»',
        ).toBe('1.4 kg');
    });

    it('los idiomas de coma la conservan', async () => {
        for (const locale of ['fr-FR', 'it-IT', 'pt-BR']) {
            await cargar(locale);
            const { glossShoppingQty } = await import('../utils/shoppingHelpers');
            const { t } = await import('../i18n');
            expect(glossShoppingQty(DEL_BACKEND, t), locale).toContain('1,4');
        }
    });

    it('NO se reagrupan los millares: «1250 g» no puede volverse «1.250 g»', async () => {
        await cargar('fr-FR');
        const { glossShoppingQty } = await import('../utils/shoppingHelpers');
        const { t } = await import('../i18n');
        const salida = glossShoppingQty('1250 g', t);
        expect(
            salida,
            'se está reagrupando. En una lista de la compra «1.250 g» se puede leer como '
            + 'mil doscientos cincuenta veces más — el gap dice «separador», no «formato»',
        ).toContain('1250');
    });

    it('una cantidad sin decimales sale intacta', async () => {
        await cargar('it-IT');
        const { glossShoppingQty } = await import('../utils/shoppingHelpers');
        const { t } = await import('../i18n');
        expect(glossShoppingQty('454 g', t)).toContain('454 g');
    });
});

describe('la hora del coach', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('sale en 24 h donde el idioma lo pide, y en 12 h donde lo pide', async () => {
        const fecha = new Date('2026-08-22T17:44:00Z');
        const salidas = {};
        for (const locale of ['es-DO', 'en-US', 'fr-FR', 'it-IT']) {
            const { formatDate } = await cargar(locale);
            salidas[locale] = formatDate(fecha, { timeStyle: 'short' });
        }
        // en-US es el único de los cuatro que usa AM/PM. Con el `hour12: true` que este gap
        // quita, los cuatro salían igual — y esa uniformidad ERA el defecto.
        expect(/[AP]M/i.test(salidas['en-US']), 'en-US debería llevar AM/PM').toBe(true);
        for (const locale of ['fr-FR', 'it-IT']) {
            expect(
                /[AP]M/i.test(salidas[locale]),
                `${locale} salió con AM/PM: alguien volvió a forzar hour12`,
            ).toBe(false);
        }
    });
});
