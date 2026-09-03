// [P2-PRIMARY-FILL-INK · 2026-09-03 · secuela] Al pasar --primary-fill en oscuro de la tinta clara
// al índigo 700, cuatro overrides oscuros que ponían TEXTO OSCURO sobre ese relleno («el primary es
// claro → texto oscuro») quedaron ilegibles: «Mejorar plan» de la barra lateral, la burbuja y el
// botón de enviar del bot de ayuda y el avatar del Header. Este guard falla si un bloque de tema
// oscuro pone texto oscuro sobre un selector que rellena con --primary-fill / --cta-fill.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const read = (p) => readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const DARK_TEXT = /color:\s*(#0b1120|#0f172a|#111827|var\(--bg-card\)|var\(--bg-page\)|var\(--text-main\))\s*;/i;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p, out); continue; }
        if (name.endsWith('.css')) out.push(p);
    }
    return out;
}

describe('tinta sobre el relleno índigo en oscuro', () => {
    it('ningún bloque oscuro pone texto oscuro sobre un selector que rellena con el token', () => {
        const hits = [];
        for (const p of walk(SRC)) {
            const css = read(p);
            const base = {};
            const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim().split('\n').pop().trim(), m[2]]);
            for (const [sel, body] of rules) {
                if (sel.includes('data-theme')) continue;
                for (const c of sel.match(/\.[A-Za-z0-9_-]+/g) || []) base[c] = (base[c] || '') + body;
            }
            for (const [sel, body] of rules) {
                if (!sel.includes('data-theme') || !DARK_TEXT.test(body)) continue;
                const own = sel.split(')').pop();
                for (const c of own.match(/\.[A-Za-z0-9_-]+/g) || []) {
                    const b = (base[c] || '') + body;
                    if (/primary-fill|cta-fill/.test(b)) hits.push(`${p.slice(SRC.length + 1)} → ${sel}`);
                }
            }
        }
        expect(hits, hits.join('\n')).toEqual([]);
    });

    it('los cuatro afectados llevan tinta blanca y el hover no salta al índigo pastel', () => {
        const menu = read(join(SRC, 'components', 'dashboard', 'AccountMenu.module.css'));
        expect(menu).toContain(":global(html[data-theme='dark']) .verBtn { color: #fff; }");
        expect(menu).not.toContain(".verBtn:hover { background: var(--primary-light); }");
        const help = read(join(SRC, 'components', 'dashboard', 'HelpChatWidget.module.css'));
        expect(help).toContain(":global(html[data-theme='dark']) .bubbleUser { color: #fff; }");
        expect(help).toContain(":global(html[data-theme='dark']) .sendBtn { color: #fff; }");
        expect(help).not.toContain('.sendBtn:hover:not(:disabled) { background: var(--primary-light); }');
        const header = read(join(SRC, 'components', 'layout', 'Header.module.css'));
        expect(header).toMatch(/data-theme="dark"\]\) \.accountAvatar \{\s*color: #FFFFFF;/);
    });
});
