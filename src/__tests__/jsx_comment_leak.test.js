/**
 * [P2-JSX-COMMENT-LEAK · 2026-08-23] Un `//` en posición de HIJO de JSX no es un
 * comentario: es texto, y React lo pinta.
 *
 * Así llegó a la cabecera del landing de papel, en producción, un marcador de exención
 * de i18n escrito con doble barra: dejó de ser una nota para otro guard y pasó a ser copy
 * visible. Lo vio el dueño en una captura; ningún test podía verlo porque todos los
 * guards de i18n leen el FUENTE, donde la línea parece exactamente lo que su autor creía
 * que era. (Aquí se describe sin citarlo literal: el escáner de exenciones busca el
 * marcador POR LÍNEA, y una cita partida en dos lo hace saltar sobre este fichero.)
 *
 * En JSX los comentarios entre etiquetas van SIEMPRE entre llaves: `{/* … *\/}`.
 *
 * El barrido busca la firma estructural, no el texto: una línea `//` muy indentada cuyo
 * vecino anterior cierra una etiqueta y cuyo vecino siguiente abre otra. Eso solo puede
 * ocurrir dentro del cuerpo de un JSX.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');

function jsxFiles(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!/node_modules|__tests__/.test(e.name)) jsxFiles(p, out); }
        else if (e.name.endsWith('.jsx')) out.push(p);
    }
    return out;
}

describe('[P2-JSX-COMMENT-LEAK] ningún comentario // se cuela como texto en la interfaz', () => {
    it('no hay `//` en posición de hijo de JSX', () => {
        const culpables = [];
        for (const f of jsxFiles(SRC)) {
            const lines = fs.readFileSync(f, 'utf-8').split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (!/^\s{8,}\/\//.test(lines[i])) continue;
                const prev = [...lines.slice(0, i)].reverse().find((l) => l.trim()) || '';
                const next = lines.slice(i + 1).find((l) => l.trim()) || '';
                const cierraEtiqueta = /(\/>|<\/[A-Za-z][\w.]*>|^\s*<[A-Za-z][^>]*>)\s*$/.test(prev);
                const abreEtiqueta = /^\s*<[A-Za-z{]/.test(next);
                if (cierraEtiqueta && abreEtiqueta) {
                    const rel = path.relative(SRC, f).split(path.sep).join('/');
                    culpables.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 70)}`);
                }
            }
        }
        expect(culpables, 'Usa {/* … */} — un `//` entre etiquetas es TEXTO que React pinta').toEqual([]);
    });
});
