/**
 * [P1-PLAN-LOTE-1065 · 2026-11-17] Lo que quedaba abierto de docs/diseno/auditoria_2026-11-17.md:
 * 4 saludo con degradado propio · 7 PDF de la lista con Inter y letra de 10-11 px · 8 maqueta del login con 9-11 px ·
 * 9 `window.confirm` en el súper · y el último botón principal con degradado violeta (planes).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const leer = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const DASH = leer('src/pages/Dashboard.jsx');

describe('[1065] restos de la auditoría', () => {
    it('el nombre del saludo va en el índigo de la marca, sin degradado', () => {
        const i = DASH.indexOf('const _GREETING_NAME_STYLE = {');
        const bloque = DASH.slice(i, DASH.indexOf('};', i));
        expect(bloque).toContain("color: 'var(--primary)'");
        expect(bloque).not.toMatch(/gradient|WebkitTextFillColor/);
    });

    it('el PDF de la lista usa la letra de la marca y nada por debajo de 12 px', () => {
        const i = DASH.indexOf("font-family: 'Outfit', system-ui, sans-serif; padding: ${rootPadding}");
        expect(i).toBeGreaterThan(0);
        const plantilla = DASH.slice(i - 2000, i + 40000);
        expect(plantilla).not.toContain("'Inter'");
        const chicos = [...plantilla.matchAll(/font-size: ?([0-9.]+)px/g)].filter((m) => Number(m[1]) < 12);
        expect(chicos.map((m) => m[0])).toEqual([]);
    });

    it('la maqueta del login no baja de 12 px', () => {
        const chicos = [...leer('src/pages/Login.css').matchAll(/font-size:\s*(\d*\.?\d+)(rem|px)/g)]
            .filter((m) => Number(m[1]) * (m[2] === 'rem' ? 16 : 1) < 12);
        expect(chicos.map((m) => m[0])).toEqual([]);
    });

    it('ningún fichero de la app usa window.confirm (rompe el tema oscuro; hay confirmToast)', () => {
        const malos = [];
        (function walk(d) {
            for (const n of readdirSync(d)) {
                const f = join(d, n);
                if (statSync(f).isDirectory()) { if (n !== '__tests__') walk(f); }
                else if (/\.(jsx?|tsx?)$/.test(n) && !n.startsWith('confirmToast')) {
                    if (/window\.confirm\(/.test(readFileSync(f, 'utf8'))) malos.push(n);
                }
            }
        })(resolve(process.cwd(), 'src'));
        expect(malos).toEqual([]);
    });

    it('el botón principal de los planes es índigo sólido', () => {
        const css = leer('src/pages/Upgrade.module.css');
        for (const m of css.matchAll(/\.planButtonPrimary(?::hover:not\(:disabled\))?\s*\{([^}]*)\}/g)) {
            expect(m[1]).not.toMatch(/gradient/);
        }
    });
});
