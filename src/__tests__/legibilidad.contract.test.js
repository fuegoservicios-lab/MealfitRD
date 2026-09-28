// [P1-PLAN-LOTE-710 · 2026-09-28] Contrato de legibilidad de la app.
//
// Medido antes del lote: 265 tamaños de letra por debajo de 12 px (el menor, 8,8 px
// en el estado de los días de la semana; párrafos explicativos enteros a 11,2 px) y el
// gris de ADORNO (`--text-light`, 3:1 en claro) pintando texto con información:
// mensajes de notificaciones, unidades, fechas, estados vacíos.
//
// Dos reglas con números, para que el siguiente componente no las reabra:
//   1. Ningún texto baja de 12 px. Un piso nunca invierte la jerarquía: lo que era
//      mayor sigue siéndolo. Fuera quedan las unidades `em` (relativas al padre) y el
//      mockup decorativo del login (`Login.css`, aria-hidden).
//   2. Los usos de `color: var(--text-light)` sólo pueden BAJAR (trinquete). Ese gris es
//      para chevrons, placeholders de adorno, separadores y estados deshabilitados; el
//      texto que dice algo va en `--text-muted` (AA en los dos temas, ver
//      lightContrast.contract.test.js).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative, sep } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, '..');
const EXCLUIDOS = new Set([join('pages', 'Login.css')]);

function* ficheros(dir) {
    for (const nombre of readdirSync(dir)) {
        const p = join(dir, nombre);
        if (statSync(p).isDirectory()) {
            if (nombre === '__tests__') continue;
            yield* ficheros(p);
        } else if (/\.(css|jsx|js)$/.test(nombre) && !nombre.includes('.test.')) {
            const rel = relative(SRC, p);
            if (!EXCLUIDOS.has(rel)) yield [rel.split(sep).join('/'), readFileSync(p, 'utf8')];
        }
    }
}

const FUENTES = [...ficheros(SRC)];
const aPx = (v, u) => (u === 'rem' ? Number(v) * 16 : Number(v));

describe('[P1-PLAN-LOTE-710] piso tipográfico', () => {
    it('ningún font-size / fontSize baja de 12 px', () => {
        const pequenos = [];
        for (const [rel, txt] of FUENTES) {
            const lineas = txt.split('\n');
            lineas.forEach((l, i) => {
                const reglas = rel.endsWith('.css')
                    ? [...l.matchAll(/font-size\s*:\s*(\d*\.?\d+)(rem|px)\b/g)].map((m) => aPx(m[1], m[2]))
                    : [
                        ...[...l.matchAll(/fontSize\s*:\s*(['"])(\d*\.?\d+)(rem|px)\1/g)].map((m) => aPx(m[2], m[3])),
                        ...[...l.matchAll(/fontSize\s*:\s*(\d+(?:\.\d+)?)(?=\s*[,}])/g)].map((m) => Number(m[1])),
                    ];
                for (const px of reglas) if (px < 12) pequenos.push(`${rel}:${i + 1} → ${px.toFixed(1)} px`);
            });
        }
        expect(pequenos, `texto por debajo de 12 px:\n${pequenos.join('\n')}`).toEqual([]);
    });
});

describe('[P1-PLAN-LOTE-710] el gris de adorno no pinta información', () => {
    // Trinquete: 72 tras el lote. Si lo bajas, baja también este número.
    const TOPE = 72;
    it(`color: var(--text-light) no pasa de ${TOPE} usos`, () => {
        let n = 0;
        for (const [, txt] of FUENTES) {
            n += (txt.match(/color\s*:\s*['"]?var\(--text-light/g) || []).length;
        }
        expect(n, 'nuevo texto con --text-light: si dice algo, usa --text-muted').toBeLessThanOrEqual(TOPE);
    });
});
