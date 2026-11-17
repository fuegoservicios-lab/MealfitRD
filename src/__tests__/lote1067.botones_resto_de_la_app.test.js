/**
 * [P1-PLAN-LOTE-1067 · 2026-11-17] El resto de la app: ningún botón de acción con relleno propio (degradado o color de
 * estado) y los botones simples de acción pasan a `components/ui/Button`.
 * Se quedan a propósito con estilo propio: el obturador de la cámara (círculo de 64 px), el CTA del estado vacío
 * (su brillo al pasar el ratón vive en `.mf-empty-cta`), el par del permiso de IA (comparten `botonBase` con el de al
 * lado) y el cupón del modal de pago (paleta oscura propia del modal).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const leer = (p) => readFileSync(resolve(SRC, p), 'utf8');

function etiquetas(src) {
    const out = [];
    let i = 0;
    while ((i = src.indexOf('<button', i)) !== -1) {
        if (!/[\s>]/.test(src[i + 7])) { i += 1; continue; }
        let d = 0;
        let j = i + 7;
        for (; j < src.length; j++) {
            const c = src[j];
            if (c === '{') d += 1; else if (c === '}') d -= 1; else if (c === '>' && d === 0) break;
        }
        out.push({ linea: src.slice(0, i).split('\n').length, tag: src.slice(i, j + 1) });
        i = j;
    }
    return out;
}

describe('[1067] botones del resto de la app', () => {
    it('ningún <button> de acción pinta un degradado o un color de estado como relleno', () => {
        const malos = [];
        (function walk(d) {
            for (const n of readdirSync(d)) {
                const f = join(d, n);
                if (statSync(f).isDirectory()) { if (n !== '__tests__') walk(f); continue; }
                if (!n.endsWith('.jsx')) continue;
                for (const e of etiquetas(readFileSync(f, 'utf8'))) {
                    if (!/style=\{\{/.test(e.tag)) continue;
                    if (/role="switch"|aria-pressed=|aria-selected=|role="tab"|'--cat'/.test(e.tag)) continue;
                    if (/background:\s*['`](linear-gradient|#(047857|F59E0B|EF4444|10B981))/i.test(e.tag)) {
                        malos.push(`${relative(SRC, f)}:${e.linea}`);
                    }
                }
            }
        })(SRC);
        expect(malos).toEqual([]);
    });

    it.each([
        'components/RouteErrorBoundary.jsx', 'components/assessment/questions/QTrackingFinish.jsx',
        'components/pantry/PantryScanButton.jsx', 'components/common/CameraViewfinder.jsx', 'components/common/ConfirmDialog.jsx',
    ])('%s usa el botón común', (f) => {
        expect(leer(f)).toMatch(/import Button from '[./]+(components\/)?ui\/Button';/);
        expect(leer(f)).toContain('<Button');
    });

    it('el diálogo de confirmación elige la variante de peligro cuando toca', () => {
        expect(leer('components/common/ConfirmDialog.jsx')).toContain("variant={req.danger ? 'danger' : 'primary'}");
    });
});
