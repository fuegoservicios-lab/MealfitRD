/**
 * [P1-PLAN-LOTE-1063 · 2026-11-17] El sistema de diseño se defiende solo (guía: docs/diseno/ESTILO.md).
 *
 * 1. ESTRICTO: toda `var(--x)` sin respaldo apunta a un token que existe. `var(--text)` no existía y cuatro textos
 *    caían al color heredado sin que nadie lo viera.
 * 2. TRINQUETE: la deuda medida el 17-nov (valores sueltos en vez de tokens) puede BAJAR, nunca subir. Si un cambio
 *    la baja, actualiza el número aquí (y celébralo); si la sube, usa el token o la escala de ESTILO.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const ficheros = [];
(function walk(d) {
    for (const n of readdirSync(d)) {
        const f = join(d, n);
        if (statSync(f).isDirectory()) { if (!['__tests__', 'i18n'].includes(n)) walk(f); }
        else if (/\.(css|jsx|js)$/.test(n) && !/\.test\.jsx?$/.test(n)) ficheros.push(f);
    }
})(SRC);
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const TXT = new Map(ficheros.map((f) => [f, sinComentarios(readFileSync(f, 'utf8'))]));

const ESCALA_PX = new Set([12, 13, 14, 15, 16, 18, 20, 24, 30, 36, 48]);

function contar() {
    const c = { hex: 0, fontFueraDeEscala: 0, radioLiteral: 0, zLiteral: 0, estiloEnLinea: 0, emojiIcono: 0 };
    for (const [f, s] of TXT) {
        c.hex += (s.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
        for (const m of s.matchAll(/font-?[sS]ize\s*[:=]\s*['"]?\s*(\d*\.?\d+)(px|rem)/g)) {
            const px = Math.round(Number(m[1]) * (m[2] === 'rem' ? 16 : 1) * 10) / 10;
            if (!ESCALA_PX.has(px)) c.fontFueraDeEscala += 1;
        }
        for (const m of s.matchAll(/border-?[rR]adius\s*[:=]\s*['"]?([^;'",}]+)/g)) {
            const v = m[1].trim();
            if (!/var\(|^0$|^50%$|^inherit$/.test(v)) c.radioLiteral += 1;
        }
        for (const m of s.matchAll(/z-?[iI]ndex\s*[:=]\s*['"]?([^;'",}]+)/g)) {
            const v = m[1].trim();
            if (!/var\(|^-?[0-3]$|^auto$/.test(v)) c.zLiteral += 1;
        }
        if (f.endsWith('.jsx')) {
            c.estiloEnLinea += (s.match(/style=\{\{/g) || []).length;
            c.emojiIcono += (s.match(/icon:\s*['"][\u{1F300}-\u{1FAFF}☀-➿]/gu) || []).length;
        }
    }
    return c;
}

// Medido el 2026-11-17 (lote 1063). SOLO PUEDE BAJAR.
// [1064] Botón común, «Cambiar plato» secundario y emojis→lucide: hex 2632→2619, letra 1212→1210, radios 1119→1118,
// emojis-icono 48→1 (queda el «✓» tipográfico del presupuesto, pareja de «≈» y «▲»: no es un emoji).
// [1065] Saludo, PDF y login a la escala, Planes índigo sólido: hex 2619→2609, letra 1210→1188.
const TECHO = { hex: 2609, fontFueraDeEscala: 1188, radioLiteral: 1118, zLiteral: 60, estiloEnLinea: 1440, emojiIcono: 1 };

describe('[1063] sistema de diseño', () => {
    it('toda var(--x) sin respaldo es un token definido', () => {
        const definidos = new Set();
        for (const s of TXT.values()) {
            for (const m of s.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) definidos.add(m[1]);
            for (const m of s.matchAll(/['"](--[a-zA-Z0-9-]+)['"]\s*[:\],]/g)) definidos.add(m[1]);
            for (const m of s.matchAll(/setProperty\(\s*['"`](--[a-zA-Z0-9-]+)/g)) definidos.add(m[1]);
        }
        const sueltos = [];
        for (const [f, s] of TXT) {
            for (const m of s.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)) {
                if (!definidos.has(m[1])) sueltos.push(`${relative(SRC, f)}: ${m[1]}`);
            }
        }
        expect(sueltos).toEqual([]);
    });

    it('la deuda de valores sueltos no crece (trinquete)', () => {
        const c = contar();
        for (const k of Object.keys(TECHO)) {
            expect(c[k], `${k}: ${c[k]} > techo ${TECHO[k]} — usa el token o la escala de docs/diseno/ESTILO.md`).toBeLessThanOrEqual(TECHO[k]);
        }
    });
});
