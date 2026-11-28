/**
 * [P1-JSX-SIN-IMPORT · 2026-11-27] Todo componente usado como `<Nombre …>` existe en su archivo (importado o declarado).
 *
 * `MessageBubble.jsx` pintaba `<RefreshCw>` en «Reintentar» sin importarlo (se perdió el import el 17-nov): el primer
 * mensaje que fallaba lanzaba ReferenceError y dejaba el chat EN BLANCO. Ni el lint (no mira JSX) ni ningún test
 * (ninguno pintaba la burbuja de error) lo veían. Este barrido es barato y cubre la clase entera.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

function archivos(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') archivos(p, out); }
        else if (/\.(jsx|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
}

// quita comentarios de bloque, de JSX y de línea (sin tocar `//` dentro de cadenas como 'https://')
const sinComentarios = (s) => s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/\s.*$/gm, '');

describe('JSX: ningún componente sin declarar', () => {
    it('cada <Componente> usado aparece importado o declarado en su archivo', () => {
        const faltan = [];
        for (const p of archivos(SRC)) {
            const src = sinComentarios(fs.readFileSync(p, 'utf8'));
            const usados = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)].map((m) => m[1]));
            for (const id of usados) {
                const resto = src.replace(new RegExp(`</?${id}(?![A-Za-z0-9_])`, 'g'), '');
                if (!new RegExp(`(^|[^A-Za-z0-9_])${id}([^A-Za-z0-9_]|$)`, 'm').test(resto)) {
                    faltan.push(`${path.relative(SRC, p)}: <${id}>`);
                }
            }
        }
        expect(faltan).toEqual([]);
    });

    it('«Reintentar» de la burbuja de error importa su icono', () => {
        const mb = fs.readFileSync(path.join(SRC, 'components/agent/MessageBubble.jsx'), 'utf8');
        expect(mb).toMatch(/import \{[^}]*\bRefreshCw\b[^}]*\} from 'lucide-react'/);
    });
});
