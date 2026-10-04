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

const HUELLAS_IA_2026_10 = {
    'es-DO': '311db8c54f0d982545ebd147dc61be54a7a476dd67b3ec198db9b5caed978942',
    'en-US': '9e00c6b59309527034232756cd124d45ab9e2d52c2ebe839de77926de6966f71',
    'pt-BR': 'b671c20a692d901eb6c4c75898a8605c376ea07bb75f2b94b0678f1f12724314',
    'fr-FR': 'f267bcae207b4764dd40974a95c12d8ccaa2dcbccb3e91f7effcb7ff544b22d9',
    'it-IT': 'f7e267b266bae0e2a6b14152293079fe5d2755f5b2962fd0393abc6acb392eef',
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
        expect(AI_CONSENT_VERSION).toBe('ia-2026-10-voz');
    });

    it.each(IDIOMAS)('%s: el SHA-256 del texto mostrado es el fijado para ia-2026-10-voz', async (locale) => {
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
