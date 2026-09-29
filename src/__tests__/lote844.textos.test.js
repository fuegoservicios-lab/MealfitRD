/**
 * [P1-PLAN-LOTE-844 · ronda 1] El texto del permiso para la IA, versionado y demostrable (art. 7.1 del RGPD).
 *
 * El SHA-256 que viaja en `text_sha256` se calcula sobre el texto que la hoja muestra en cada idioma. Esta tabla lo
 * FIJA para `ia-2026-10`: si cambias el texto de la hoja o una de sus traducciones, este test cae. Entonces decide:
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
    'es-DO': '830abb4b08c5108f67001f2e406ba345ef5882e7efda98c208369aafe6d7ba14',
    'en-US': 'a4e646fa4e6640f13515a2501b746abbc709cfd9c9a58fd0cbc087ac1a17cff2',
    'pt-BR': '181052cb0ec126be4c94a557bd7a955d3d49314bb74bd2e82133042617a6b695',
    'fr-FR': '14718025b67df2dcbc028dbee56a765d5d740fa74de40fb975afd89e4f4807f8',
    'it-IT': '6572aa3c131eca2e909f0269837deee79dc8e68bd4f6af527c357af090a8c091',
};
const IDIOMAS = Object.keys(HUELLAS_IA_2026_10);
const DIR_BACKEND = resolve(__dirname, '../../../backend/docs/consentimientos/ia', AI_CONSENT_VERSION);

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
        expect(AI_CONSENT_VERSION).toBe('ia-2026-10');
    });

    it.each(IDIOMAS)('%s: el SHA-256 del texto mostrado es el fijado para ia-2026-10', async (locale) => {
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
