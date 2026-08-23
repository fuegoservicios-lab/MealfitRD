/**
 * [P1-KB-SONDA · 2026-08-23] La sonda del teclado es una herramienta de diagnóstico y NO
 * puede llegar a producción: pinta números encima de la interfaz y escribe en
 * sessionStorage en cada evento del viewport.
 *
 * Dos cerrojos, y el guard exige los dos: el módulo se niega fuera de `import.meta.env.DEV`
 * y el arranque en main.jsx está gateado por lo mismo. Con uno solo, un refactor del otro
 * la cuela.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('[P1-KB-SONDA] la sonda del teclado no existe en producción', () => {
    it('el módulo se niega fuera de DEV como PRIMERA línea ejecutable', () => {
        const src = read('utils/keyboardProbe.js');
        const cuerpo = src.slice(src.indexOf('export function iniciarSondaTeclado'));
        const primera = cuerpo.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'))[1];
        expect(primera).toMatch(/^if \(!import\.meta\.env\.DEV\) return/);
    });

    it('main.jsx sólo la arranca bajo import.meta.env.DEV', () => {
        const src = read('main.jsx');
        expect(src).toMatch(/if \(import\.meta\.env\.DEV\) iniciarSondaTeclado\(\);/);
        // y no hay NINGUNA otra llamada sin gate
        const llamadas = src.split('\n').filter((l) => /iniciarSondaTeclado\(\)/.test(l) && !/^\s*\/\//.test(l));
        expect(llamadas).toHaveLength(1);
    });

    it('además exige opt-in explícito (?kbprobe o localStorage): DEV solo no basta', () => {
        const src = read('utils/keyboardProbe.js');
        expect(src).toMatch(/has\('kbprobe'\)/);
        expect(src).toMatch(/if \(!activa\) return/);
    });
});
