/**
 * [P1-I18N-CLAIM-Y-ESTAMPADO-SIN-GUARD-DE-CONDUCTA · 2026-08-23] Las dos mitades de la
 * persistencia del idioma se podían BORRAR enteras con los guards en verde.
 *
 * `P2-I18N-LOCALE-SOBREVIVE-LOGOUT` (sello de dueño `mealfit_locale_owner`, para que un
 * dispositivo compartido no le grabe al recién llegado el idioma del anterior) y
 * `P1-I18N-PROFILE-DEFAULT-PISA` (estampado del idioma activo cuando el perfil trae NULL)
 * estaban anclados por tests del backend que LEEN EL FICHERO: comprueban que existe el
 * nombre de la función, que aparece la cadena `mealfit_locale_owner` y que una llamada va
 * antes que otra. Ninguno ejecuta nada.
 *
 * MEDIDO montando un espejo del árbol fuera del repo y mutando el código de producción:
 *
 *     comparación invertida (`!==` → `===`: nunca descarta idioma ajeno)  → 13 passed
 *     cuerpo de `claimLocaleForUser` vaciado a `return getLocale();`      → 13 passed
 *     `LOCALE_OWNER_KEY` borrada y `_persistOwner` vaciado                 → 13 passed
 *
 * El mecanismo puede NO EXISTIR y el guard sigue verde. Éste ejecuta la función de verdad,
 * que es lo único que distingue «está escrito» de «funciona».
 *
 * LO QUE SE PROTEGE, en dos sentidos que son igual de importantes:
 *   1. Un usuario DISTINTO del sellado no hereda el idioma: se descarta y se re-detecta.
 *   2. El MISMO usuario (y el caso sin dueño previo) CONSERVA su elección. Si el guard
 *      sólo mirase el primero, un arreglo que descarte siempre lo pondría verde y rompería
 *      la persistencia para todo el mundo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const LOCALE_KEY = 'mealfit_locale';
const OWNER_KEY = 'mealfit_locale_owner';

describe('[P1-I18N-CLAIM-Y-ESTAMPADO-SIN-GUARD-DE-CONDUCTA] claimLocaleForUser', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        // Dispositivo en italiano y en el host de la app: la autodetección, cuando
        // corresponda, tiene que dar it-IT y no el es-DO de jsdom.
        vi.stubGlobal('navigator', { languages: ['it-IT'], language: 'it-IT' });
        vi.stubGlobal('location', { pathname: '/dashboard', hostname: 'app.bioboros.com', protocol: 'https:' });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('MUTACIÓN 1 y 2 — un usuario DISTINTO del sellado no hereda el idioma del anterior', async () => {
        localStorage.setItem(LOCALE_KEY, 'fr-FR');     // lo eligió el usuario A
        localStorage.setItem(OWNER_KEY, 'A');
        const { claimLocaleForUser } = await import('../i18n');

        const activo = await claimLocaleForUser('B');

        expect(localStorage.getItem(LOCALE_KEY), 'el idioma ajeno sigue en el dispositivo').not.toBe('fr-FR');
        expect(activo, 'B hereda el francés de A en vez de re-detectar').not.toBe('fr-FR');
        expect(localStorage.getItem(OWNER_KEY), 'el sello no pasó al nuevo dueño').toBe('B');
    });

    it('el MISMO usuario CONSERVA su elección (la otra dirección, sin la cual el guard es un estorbo)', async () => {
        localStorage.setItem(LOCALE_KEY, 'fr-FR');
        localStorage.setItem(OWNER_KEY, 'A');
        const { claimLocaleForUser, loadLocale } = await import('../i18n');
        await loadLocale('fr-FR');

        const activo = await claimLocaleForUser('A');

        expect(activo, 'se le descartó al dueño su propia elección').toBe('fr-FR');
        expect(localStorage.getItem(LOCALE_KEY)).toBe('fr-FR');
    });

    it('sin dueño previo no se descarta nada y se sella al que entra', async () => {
        localStorage.setItem(LOCALE_KEY, 'pt-BR');    // elegido antes de tener cuenta
        const { claimLocaleForUser, loadLocale } = await import('../i18n');
        await loadLocale('pt-BR');

        const activo = await claimLocaleForUser('C');

        expect(activo, 'sin dueño previo no hay nada ajeno que descartar').toBe('pt-BR');
        expect(localStorage.getItem(OWNER_KEY), 'MUTACIÓN 3: el sello no se escribe').toBe('C');
    });

    it('MUTACIÓN 3 — el sello EXISTE tras reclamar (sin él, nada de lo anterior puede funcionar)', async () => {
        const { claimLocaleForUser } = await import('../i18n');
        await claimLocaleForUser('D');
        expect(localStorage.getItem(OWNER_KEY), '`_persistOwner` no escribe: el mecanismo no existe').toBe('D');
    });

    it('sin userId (invitado) no se sella ni se descarta', async () => {
        localStorage.setItem(LOCALE_KEY, 'fr-FR');
        localStorage.setItem(OWNER_KEY, 'A');
        const { claimLocaleForUser } = await import('../i18n');
        await claimLocaleForUser(null);
        expect(localStorage.getItem(OWNER_KEY), 'un invitado no puede reclamar el dispositivo').toBe('A');
        expect(localStorage.getItem(LOCALE_KEY)).toBe('fr-FR');
    });
});

describe('[P1-I18N-CLAIM-Y-ESTAMPADO-SIN-GUARD-DE-CONDUCTA] localeParaEstampar', () => {
    // La decisión del estampado de P1-I18N-PROFILE-DEFAULT-PISA, ejecutada. Antes vivía
    // dentro del `useEffect` del Provider y su único guard leía el fichero.
    it('perfil sin idioma (NULL) → se estampa el activo tras reclamar', async () => {
        const { localeParaEstampar } = await import('../i18n');
        expect(localeParaEstampar(null, 'fr-FR')).toBe('fr-FR');
        expect(localeParaEstampar(undefined, 'it-IT')).toBe('it-IT');
        expect(localeParaEstampar('', 'pt-BR')).toBe('pt-BR');
    });

    it('perfil CON idioma → no se toca (pisarlo sería el default sembrado, del revés)', async () => {
        const { localeParaEstampar } = await import('../i18n');
        expect(localeParaEstampar('fr-FR', 'it-IT'), 'se pisó una elección real').toBeNull();
        expect(localeParaEstampar('es-DO', 'fr-FR')).toBeNull();
    });

    it('un activo que no es un idioma soportado no se estampa', async () => {
        const { localeParaEstampar } = await import('../i18n');
        expect(localeParaEstampar(null, 'xx-YY')).toBeNull();
        expect(localeParaEstampar(null, null)).toBeNull();
    });
});

// El consumidor, por propiedad: que el PATCH salga de la decisión pura y no de un `if`
// a mano que pueda volver a divergir.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

describe('[P1-I18N-CLAIM-Y-ESTAMPADO-SIN-GUARD-DE-CONDUCTA] el Provider consume la decision', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dirname, '..', 'context', 'AssessmentContext.jsx'), 'utf-8');
    it('el estampado del perfil pasa por localeParaEstampar', () => {
        const i = src.indexOf('localeParaEstampar(data.locale');
        expect(i, 'el PATCH de locale volvió a decidirse a mano').toBeGreaterThan(0);
        const cola = src.slice(i, i + 600);
        expect(cola).toMatch(/fields:\s*\{\s*locale:\s*_estampar\s*\}/);
    });
});
