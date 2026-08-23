/**
 * [P3-I18N-TIPOGRAFIA-SIN-PASADA · 2026-08-23] Ningún catálogo tenía un solo espacio
 * irrompible: en francés, 334 cadenas podían dejar el «?» / «!» / «:» solo al principio de
 * línea, o romper «guillemets». Pasada tipográfica sobre fr-FR (330 cadenas): fino
 * irrompible (U+202F) antes de ? ! ; y entre cifra y %; irrompible (U+00A0) antes de : y
 * dentro de « ». Este guard impide que una traducción nueva vuelva al espacio normal.
 */
import { describe, it, expect } from 'vitest';
import fr from '../i18n/locales/fr-FR.json';

describe('[P3-I18N-TIPOGRAFIA-SIN-PASADA] francés', () => {
    it('ningún valor lleva espacio NORMAL antes de ? ! ; : ni dentro de « »', () => {
        const malos = [];
        const valores = (v) => (v && typeof v === 'object' ? Object.values(v) : [v]);
        for (const [k, v0] of Object.entries(fr)) {
            if (k.startsWith('_')) continue;
            for (const v of valores(v0)) {
            const s = String(v);
            // Un valor que EMPIEZA por « :» es un fragmento de concatenación, no prosa.
            const cuerpo = s.replace(/^ [:?!;]/, '');
            if (/ [?!;:]/.test(cuerpo) || /« | »/.test(cuerpo)) malos.push(`${k} → ${v}`);
            }
        }
        expect(malos.slice(0, 10), `${malos.length} cadena(s) sin pasada tipográfica`).toEqual([]);
    });

    it('la pasada existe: hay cientos de irrompibles, no cero', () => {
        const con = Object.values(fr).filter((v) => /[\u00a0\u202f]/.test(String(v))).length;
        expect(con).toBeGreaterThan(250);
    });

    it('los placeholders sobreviven a la pasada', () => {
        // Los plurales son objetos {one, other}: cada forma lleva los mismos placeholders que la clave.
        const rotos = Object.entries(fr).filter(([k, v]) => {
            const ph = (k.match(/\{[a-zA-Z_]+\}/g) || []).sort();
            const formas = v && typeof v === 'object' ? Object.values(v) : [v];
            return formas.some((f) => JSON.stringify((String(f).match(/\{[a-zA-Z_]+\}/g) || []).sort()) !== JSON.stringify(ph));
        });
        expect(rotos.slice(0, 5)).toEqual([]);
    });
});
