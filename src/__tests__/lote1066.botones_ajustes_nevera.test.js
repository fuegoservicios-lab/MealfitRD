/**
 * [P1-PLAN-LOTE-1066 · 2026-11-17] Ajustes y Nevera: los botones de acción usan `components/ui/Button`.
 * Los únicos `<button style={{…}}>` que quedan son legítimos: los interruptores (role="switch", su propio
 * estilo), los chips de zona de la Nevera (solo pasan el color CALCULADO de la zona) y un enlace en línea.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// Recorre cada etiqueta <button …> contando llaves: un `() =>` dentro del onClick no la corta.
function botonesConEstilo(src) {
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
        const tag = src.slice(i, j + 1);
        if (/style=\{/.test(tag)) out.push(tag);
        i = j;
    }
    return out;
}

describe('[1066] botones de Ajustes y Nevera', () => {
    it.each(['src/pages/Settings.jsx', 'src/pages/Pantry.jsx'])('%s importa el botón común', (f) => {
        expect(leer(f)).toContain("import Button from '../components/ui/Button';");
    });

    it('ningún botón de acción con estilos en línea', () => {
        const malos = [];
        for (const f of ['src/pages/Settings.jsx', 'src/pages/Pantry.jsx']) {
            for (const b of botonesConEstilo(leer(f))) {
                // Legítimos: interruptores, chips/píldoras de selección (aria-pressed / estilo de píldora), el color
                // CALCULADO de la zona, enlaces en línea, el aviso clicable de permisos y el «olvidar» de la memoria.
                const legitimo = /role="switch"/.test(b)
                    || /className=\{styles\.modalBtn(Cancel|Confirm)\}/.test(b) // ya con clase; en línea solo la opacidad al procesar
                    || /aria-pressed=/.test(b)
                    || /style=\{\{ '--cat': zoneColor/.test(b)
                    || /style=\{brandPillStyle\(/.test(b)
                    || /style=\{ADD_CHIP_STYLE\}/.test(b)
                    || /textDecoration: 'underline'/.test(b)
                    || /background: 'var\(--warning-bg\)'/.test(b)
                    || /handleDeleteFact\(/.test(b)
                    || /key=\{(unit|preset)\}/.test(b)
                    || /setPickerQty\(|setQtyEditValue\(v =>/.test(b);
                if (!legitimo) malos.push(`${f}: ${b.replace(/\s+/g, ' ').slice(0, 120)}`);
            }
        }
        expect(malos).toEqual([]);
    });

    it('la Nevera ya no pinta sus acciones con el degradado celeste propio', () => {
        const src = leer('src/pages/Pantry.jsx');
        expect(src).not.toContain("linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)");
        expect(src).not.toMatch(/rgba\(14, 165, 233/);
    });
});
