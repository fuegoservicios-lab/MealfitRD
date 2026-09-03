// [P2-DARK-STATUS-BOXES · 2026-09-03] Avisos y chips con fondo pastel claro (rojo/ámbar/verde/azul/
// violeta) que no se adaptaban al tema oscuro: el de «Notificaciones bloqueadas por Brave» y once
// más. Todos pasan a los tokens de estado (`--danger-*`, `--warning-*`, `--success-*`, `--info-*`),
// que ya tenían valores propios en oscuro y en «papel». Este guard recorre las superficies del
// dashboard y falla si vuelve a aparecer un pastel sin pareja oscura.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const read = (p) => readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const PASTEL = /#(FEF2F2|FEE2E2|FECACA|FFFBEB|FEF3C7|FDE68A|FFF7ED|FFEDD5|EFF6FF|DBEAFE|BFDBFE|ECFDF5|DCFCE7|F0FDF4|D1FAE5|BBF7D0|FDF2F8|FCE7F3|F5F3FF|EDE9FE|E0E7FF|EEF2FF|C7D2FE|F0F9FF|E0F2FE|FFFAF0|FFF1F2|FFE4E6|FECDD3)\b/i;
const GUARD = /Dark\b|isDark|_settingsDark|data-theme|theme ===|prefers-color-scheme|THEME-GUARDED/i;

// Superficies del dashboard (el landing es «papel» y va aparte).
const DIRS = ['pages', 'components/dashboard', 'components/agent', 'components/common', 'components/settings',
    'components/history', 'components/recipes', 'components/plan', 'components/layout'];
const EXCLUDE = /landing|marketing|legal|PricingPage|FeaturesPage|HowItWorks|AboutPage|ContactPage|Engine|MethodPage|Countries|SecurityPage|Pricing\.jsx|Footer|\.test\./i;

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) continue;
        if (/\.(jsx|js|css)$/.test(name) && !EXCLUDE.test(p)) out.push(p);
    }
    return out;
}

const files = DIRS.flatMap((d) => walk(join(SRC, d)));

describe('cajas de estado en oscuro', () => {
    it('ningún fondo/borde pastel claro sin pareja oscura en las superficies del dashboard', () => {
        const hits = [];
        for (const p of files) {
            const rel = p.slice(SRC.length + 1).split('\\').join('/');
            const s = read(p);
            if (p.endsWith('.css')) {
                const darkSelectors = (s.match(/data-theme="dark"\)?\s*[^{]+\{/g) || []).join(' ');
                for (const m of s.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                    const sel = m[1].trim();
                    if (/data-theme|prefers-color-scheme|:root/.test(sel)) continue;
                    for (const d of m[2].matchAll(/(background[^;]*|border[^;]*):\s*([^;]*)/g)) {
                        if (!PASTEL.test(d[2])) continue;
                        const classes = [...sel.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((c) => '.' + c[1]);
                        if (classes.some((c) => darkSelectors.includes(c))) continue;
                        hits.push(`${rel} → ${sel.split('\n').pop().trim()} → ${d[0].trim().slice(0, 80)}`);
                    }
                }
                continue;
            }
            const lines = s.split(String.fromCharCode(10));
            lines.forEach((ln, i) => {
                if (!PASTEL.test(ln)) return;
                if (!/background|border|bg\b|backgroundColor|borderColor/i.test(ln)) return;
                if (/style="/.test(ln)) return;              // plantillas HTML del PDF: papel a propósito
                if (/\bid: '/.test(ln)) return;              // paletas de opciones: OptionPickerModal las traduce en oscuro
                const ctx = lines.slice(Math.max(0, i - 4), i + 2).join('\n');
                if (GUARD.test(ctx)) return;
                hits.push(`${rel}:${i + 1} → ${ln.trim().slice(0, 100)}`);
            });
        }
        expect(hits, hits.join('\n')).toEqual([]);
    });

    it('los avisos corregidos usan los tokens de estado', () => {
        const settings = read(join(SRC, 'pages', 'Settings.jsx'));
        expect(settings).toContain("background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',");   // Brave / push
        expect(settings).toContain("background: nameError ? 'var(--danger-bg)' : 'var(--bg-muted)',");
        const dash = read(join(SRC, 'pages', 'Dashboard.jsx'));
        expect(dash).toContain("background: 'var(--success-bg)', borderRadius: '10px', marginBottom: '16px', color: 'var(--success-text)'");
        expect(dash).toContain("background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--warning-bg)',");
        const logMeal = read(join(SRC, 'components', 'dashboard', 'LogMealModal.module.css'));
        expect(logMeal).toContain('background: var(--warning-bg);');
        // los tokens existen en los tres temas (claro, oscuro, papel)
        const css = read(join(SRC, 'index.css'));
        for (const tok of ['--danger-bg', '--warning-bg', '--success-bg', '--info-bg', '--danger-text', '--warning-text', '--success-text']) {
            expect((css.match(new RegExp(`${tok}:`, 'g')) || []).length, tok).toBeGreaterThanOrEqual(3);
        }
    });
});
