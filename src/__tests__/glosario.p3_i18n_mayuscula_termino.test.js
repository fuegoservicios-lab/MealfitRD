/**
 * [P3-I18N-MAYUSCULA-DEL-TERMINO-A-LA-DERIVA · 2026-08-23] El gap decía que «el mismo botón
 * se llama "Frigo" o "frigo" según la cadena» y que el trinquete, al comparar en minúsculas,
 * no podía verlo. MEDIDO sobre los cuatro catálogos: no reproduce. «Frigo» sale UNA sola
 * forma como rótulo suelto («Nevera» → «Frigo») y «frigo» sólo en mitad de frase, que es la
 * ortografía correcta; los únicos dobletes («Créditos»/«créditos») ESPEJAN dos claves
 * españolas con caja distinta. Lo que sí faltaba era un guard que fijara la propiedad, para
 * que una traducción futura no baje la caja de un rótulo: cuando la clave ES un término del
 * glosario (rótulo suelto), la traducción conserva la caja inicial del español.
 */
import { describe, it, expect } from 'vitest';
import glosario from '../i18n/glosario.json';

const sinAc = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const primera = (s) => { const m = String(s).match(/\p{L}/u); return m ? m[0] : null; };
const caja = (c) => (c && c !== c.toLowerCase() ? 'May' : 'min');

describe('[P3-I18N-MAYUSCULA-DEL-TERMINO-A-LA-DERIVA] el rótulo-término conserva la caja del español', () => {
    for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
        it(loc, async () => {
            const cat = (await import(`../i18n/locales/${loc}.json`)).default;
            const fallos = [];
            for (const [termino, spec] of Object.entries(glosario)) {
                if (termino.startsWith('_') || !spec || typeof spec !== 'object' || !spec[loc]) continue;
                for (const [k, v] of Object.entries(cat)) {
                    const base = k.split('|')[0].trim();
                    if (sinAc(base) !== sinAc(termino)) continue;   // sólo el rótulo suelto
                    const a = primera(base), b = primera(v);
                    if (!a || !b) continue;
                    if (caja(a) !== caja(b)) fallos.push(`${k} → ${v}`);
                }
            }
            expect(fallos, `${loc}: la traducción de un rótulo cambia la caja del español`).toEqual([]);
        });
    }
});
