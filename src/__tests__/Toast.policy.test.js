// [P2-TOAST-POLICY · 2026-09-03] Los avisos duraban lo que cada sitio decidía (14 de 8 s, 5 de 10 s)
// y se apilaban sin tope ni fusión. Política única: 4 s por defecto, nunca más de 6 s explícitos,
// como mucho dos visibles, los repetibles con `id` (se reemplazan) y ningún «cargando…» sin tope.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const read = (p) => readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p, out); continue; }
        if (/\.(jsx|js)$/.test(name)) out.push(p);
    }
    return out;
}
const FILES = walk(SRC);

/** Argumentos de cada `toast.loading(` (emparejando paréntesis, respetando strings). */
function loadingCalls(s) {
    const out = [];
    let i = 0;
    for (;;) {
        const j = s.indexOf('toast.loading(', i);
        if (j === -1) return out;
        let k = j + 'toast.loading('.length, depth = 1, q = null;
        while (k < s.length && depth > 0) {
            const ch = s[k];
            if (q) { if (ch === '\\') k += 1; else if (ch === q) q = null; }
            else if (ch === "'" || ch === '"' || ch === '`') q = ch;
            else if (ch === '(') depth += 1;
            else if (ch === ')') depth -= 1;
            k += 1;
        }
        out.push(s.slice(j, k));
        i = k;
    }
}

describe('política de avisos', () => {
    it('el Toaster fija 4 s por defecto y como mucho dos visibles', () => {
        const app = read(join(SRC, 'App.jsx'));
        expect(app).toContain('duration={4000}');
        expect(app).toContain('visibleToasts={2}');
        expect(app).toContain('closeButton');
    });
    it('ningún aviso pide más de 6 s (los de 8 y 10 s se sentían eternos)', () => {
        const hits = [];
        for (const p of FILES) {
            const s = read(p);
            for (const m of s.matchAll(/duration: *(\d+)\b/g)) {
                if (Number(m[1]) > 6000 && Number(m[1]) !== 20000) hits.push(`${p.slice(SRC.length + 1)} → ${m[0]}`);
            }
        }
        expect(hits, hits.join('\n')).toEqual([]);
    });
    it('todo «cargando…» lleva tope de 20 s: si su proceso no lo cierra, se cierra solo', () => {
        const orphans = [];
        for (const p of FILES) {
            const s = read(p);
            for (const call of loadingCalls(s)) {
                if (!/duration: *20000/.test(call)) orphans.push(`${p.slice(SRC.length + 1)} → ${call.slice(0, 80)}`);
            }
        }
        expect(orphans, orphans.join('\n')).toEqual([]);
    });
    it('las familias que se repiten se reemplazan por id en vez de apilarse', () => {
        expect(read(join(SRC, 'context', 'AssessmentContext.jsx'))).toContain("id: 'swap-result'");
        expect(read(join(SRC, 'pages', 'Plan.jsx'))).toContain("id: 'plan-ready'");
        expect(read(join(SRC, 'pages', 'Dashboard.jsx'))).toContain("id: 'plan-status'");
    });
});
