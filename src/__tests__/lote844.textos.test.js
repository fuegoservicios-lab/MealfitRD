/**
 * [P1-PLAN-LOTE-844 · ronda 1] El texto del permiso para la IA, versionado y demostrable (art. 7.1 del RGPD).
 *
 * El SHA-256 que viaja en `text_sha256` se calcula sobre el texto que la hoja muestra en cada idioma. Esta tabla lo
 * FIJA para `ia-2026-10-voz`: si cambias el texto de la hoja o una de sus traducciones, este test cae. Entonces decide:
 *  - si cambia lo que se promete (un proveedor, los datos, el país, los riesgos): sube `AI_CONSENT_VERSION`
 *    (version.js) y la del backend, y escribe `backend/docs/consentimientos/ia/<versión nueva>/<locale>.md`;
 *  - si es solo forma (una errata): actualiza la tabla Y el `.md` de la versión vigente, y di por qué en el commit.
 *
 * Además comprueba que el `.md` que guarda el backend coincide con el catálogo (se salta, avisando, si el repo del
 * backend no está al lado).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { t, loadLocale } from '../i18n';
import { textoDeLaHoja, textoPlanoDeLaHoja, huellaDelTexto } from '../consent/textoDeLaHoja';
import { AI_CONSENT_VERSION } from '../consent/version';

// [P1-PLAN-LOTE-995 · 2026-11-13] `ia-2026-11`: sin DeepSeek ni casilla de China (las de `ia-2026-10-voz` siguen en
// backend/docs/consentimientos/ia/ia-2026-10-voz/, que el backend aún acepta).
const HUELLAS_IA_2026_10 = {
    'es-DO': '312616076e6775346c2ec775f4128fa8e61934af2037ab6513e733553af5b859',
    'en-US': 'd9918e2d23bd52b8193490cdd0f9b5e30168149d965728f2fede20b4bc14befb',
    'pt-BR': '08029ceb291ec8ba867c0fa1735df8a0f90c934c3cde45b4c8ee8e1c05bfe95f',
    'fr-FR': 'dbf8f85dede335a550142cf04e10fcd57f98e5637a00e28cb93d9f9389449ce7',
    'it-IT': '87c0ccd617aff928fbb547a111b2d1ce948136bd8a829592d8176848a8697cc6',
};
const IDIOMAS = Object.keys(HUELLAS_IA_2026_10);
const DIR_BACKEND = resolve(process.env.MEALFIT_BACKEND_TEST_DIR || resolve(__dirname, '../../../backend'), 'docs/consentimientos/ia', AI_CONSENT_VERSION);

async function textoEn(locale) {
    await loadLocale(locale);
    return textoPlanoDeLaHoja(textoDeLaHoja(t));
}

function textoDelMd(ruta) {
    const md = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
    const m = md.match(/<!-- texto:inicio -->\n([\s\S]*?)\n<!-- texto:fin -->/);
    return m ? m[1] : null;
}

afterAll(async () => {
    await loadLocale('es-DO');
});

describe('[P1-PLAN-LOTE-844 · ronda 1] el texto del permiso está fijado por versión', () => {
    it('la tabla es la de la versión vigente', () => {
        expect(AI_CONSENT_VERSION).toBe('ia-2026-11');
    });

    it.each(IDIOMAS)('%s: el SHA-256 del texto mostrado es el fijado para ia-2026-11', async (locale) => {
        const texto = await textoEn(locale);
        expect(texto.length).toBeGreaterThan(1000);
        expect(await huellaDelTexto(texto)).toBe(HUELLAS_IA_2026_10[locale]);
    });

    it('los idiomas no caen al español: cada traducción es su propio texto', async () => {
        const huellas = new Set();
        for (const locale of IDIOMAS) huellas.add(await huellaDelTexto(await textoEn(locale)));
        expect(huellas.size).toBe(IDIOMAS.length);
    });
});

describe('[P1-PLAN-LOTE-844 · ronda 1] el backend guarda el mismo texto', () => {
    const hayBackend = existsSync(DIR_BACKEND);
    if (!hayBackend) {
        it.skip(`no está ${DIR_BACKEND} (¿el repo del backend no está al lado?): no se compara el .md`, () => {});
        return;
    }
    it.each(IDIOMAS)('%s: el .md del backend es el texto del catálogo, con su SHA-256', async (locale) => {
        const ruta = resolve(DIR_BACKEND, `${locale}.md`);
        expect(existsSync(ruta), `falta ${ruta}`).toBe(true);
        expect(textoDelMd(ruta)).toBe(await textoEn(locale));
        expect(readFileSync(ruta, 'utf8')).toContain(`\`${HUELLAS_IA_2026_10[locale]}\``);
    });
});
