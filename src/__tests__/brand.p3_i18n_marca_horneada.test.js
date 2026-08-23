/**
 * [P3-I18N-MARCA-HORNEADA-EN-26-CLAVES · 2026-08-23] «Bioboros» vivía a mano dentro de 24
 * claves y sus 96 traducciones (el gap contó 26/104 antes de dos borrados), y el guard que
 * existía vigilaba la marca ANTERIOR y sólo en dos ficheros. Un rebrand —ya hubo uno— obliga a
 * tocar cuatro catálogos y no hay forma de saber que se tocaron todos. Ahora la marca entra
 * como variable: la clave lleva `{app}` y el call site pasa `{ app: BRAND }` desde el SSOT
 * (`src/data/routeMeta.js`). `{app}` y no `{marca}`: `{marca}` ya era el placeholder de la MARCA
 * DE PRODUCTO de la lista («Marca: {marca}» = Wala, Selecto) — mi primera versión colisionó con él.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { BRAND } from '../data/routeMeta';

const SRC = resolve(__dirname, '..');
const walk = (dir, out = []) => {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) { if (!['__tests__', 'i18n'].includes(e)) walk(p, out); }
        else if (/\.(jsx?|tsx?)$/.test(e)) out.push(p);
    }
    return out;
};

describe('[P3-I18N-MARCA-HORNEADA-EN-26-CLAVES]', () => {
    it('ningún catálogo hornea la marca en una clave ni en una traducción', async () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = (await import(`../i18n/locales/${loc}.json`)).default;
            const malas = Object.entries(cat).filter(([k, v]) => k.includes(BRAND) || JSON.stringify(v).includes(BRAND));
            expect(malas.map(([k]) => k), `${loc}: la marca horneada`).toEqual([]);
        }
    });

    it('cada t()/tn() con {app} en la clave pasa app: BRAND', () => {
        const fallos = [];
        for (const f of walk(SRC)) {
            const src = readFileSync(f, 'utf8');
            // Cada literal con {app} que sea clave de t()/tn(): en los 900 caracteres que siguen al
            // inicio de la llamada tiene que estar `app: BRAND` (el tn de History lleva dos claves
            // de ~160 caracteres antes de sus vars).
            for (const m of src.matchAll(/\bt[n]?\([^)]{0,80}?['"][^'"\n]*\{app\}/g)) {
                const ventana = src.slice(m.index, m.index + 900);
                const fin = ventana.search(/\)\s*[;}]/);
                const llamada = fin > 0 ? ventana.slice(0, fin) : ventana;
                if (!/\bapp:\s*BRAND\b/.test(llamada)) fallos.push(`${f.replace(SRC, '')}: ${llamada.slice(0, 90)}`);
            }
            if (/\{app\}/.test(src) && !/import \{[^}]*\bBRAND\b[^}]*\} from '[^']*routeMeta'/.test(src)) {
                fallos.push(`${f.replace(SRC, '')}: usa {app} sin importar BRAND`);
            }
        }
        expect(fallos).toEqual([]);
    });

    it('el SSOT sigue siendo una sola palabra y la clave no vuelve a llevarla', () => {
        expect(BRAND).toBe('Bioboros');
        const conMarca = walk(SRC).filter((f) => /t\(['"][^'"]*Bioboros[^'"]*['"]/.test(readFileSync(f, 'utf8')));
        expect(conMarca.map((f) => f.replace(SRC, '')), 'una clave nueva hornea la marca').toEqual([]);
    });
});
