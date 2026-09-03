// [P2-HOVER-NO-MOTION · 2026-09-03] Pedido del dueño: «no quiero que ningún botón se mueva al
// pasarle el ratón por encima» (ejemplo: «Eliminar mi cuenta» daba un salto), «quiero parejo
// el sombreado» y el «Eliminar» del modal de conversación se veía lavado en oscuro (usaba
// --danger, que en oscuro es rojo 400: tinta, no relleno). Antecedente: P1-GUEST-MODE-BTN
// (2026-06-15) ya quitó el lift del botón de invitado por el mismo pedido.
//
// Contrato (superficies de la app; el landing tiene su propio sistema):
//   1. Ningún bloque :hover sobre un control mueve el control (translate/scale). Los
//      empujoncitos de un ICONO interior (flecha, chevron) no son el botón y se permiten.
//   2. Relleno sólido de peligro = --danger-fill (rojo 600, blanco encima) vía .ui-btn-danger;
//      el hover es sombra (--cta-shadow-danger-hover) + brillo.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8').split(String.fromCharCode(13)).join('');

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { if (name !== '__tests__') walk(full, out); }
        else if (/\.(css|jsx)$/.test(name)) out.push(full);
    }
    return out;
}

// superficies de la app (fuera: landing/marketing, header/footer públicos, páginas legales)
const APP_FILES = [
    resolve(ROOT, 'src/index.css'),
    ...['Dashboard', 'AgentPage', 'Settings', 'Plan', 'Pantry', 'Recipes', 'History', 'Auth']
        .flatMap((n) => walk(resolve(ROOT, 'src/pages')).filter((f) => /[\\/]([A-Za-z]+)(\.[a-zA-Z]+)?\.(css|jsx)$/.test(f) && f.includes(`${n}`))),
    ...['dashboard', 'settings', 'account', 'agent', 'recipes', 'ui', 'common']
        .flatMap((d) => { try { return walk(resolve(ROOT, 'src/components', d)); } catch { return []; } }),
];

// selectores que apuntan a un adorno interior, no al control
const INNER = /(svg|::before|::after|chev|arrow|icon|wrapper)[a-z]*\s*$/i;

function hoverMotions(rawSrc) {
    const out = [];
    const src = rawSrc.replace(/\/\*[\s\S]*?\*\//g, ''); // los comentarios no son reglas
    const re = /([^{}]*?:hover[^{}]*)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
        const sel = m[1].trim().replace(/\s+/g, ' ');
        const body = m[2];
        const t = /transform\s*:\s*([^;]+);/.exec(body);
        if (!t) continue;
        const v = t[1].trim();
        if (v === 'none') continue;
        if (!/translate|scale/.test(v)) continue;
        if (INNER.test(sel)) continue;
        // .handle:hover conserva SOLO su centrado vertical (translateY(-50%)): no se mueve
        if (/\.handle:hover/.test(sel) && v === 'translateY(-50%)') continue;
        out.push(`${sel.slice(-70)} -> ${v}`);
    }
    return out;
}

describe('hover sin movimiento en las superficies de la app', () => {
    it('ningún :hover de la app mueve el control (translate/scale)', () => {
        const found = [];
        for (const f of new Set(APP_FILES)) {
            const src = read(f);
            for (const h of hoverMotions(src)) found.push(`${f.replace(ROOT, '')}: ${h}`);
        }
        expect(found, found.join('\n')).toEqual([]);
    });

    it('los antiguos «lifts» pasaron a sombra de familia', () => {
        expect(read('src/pages/Pantry.fridge.module.css')).toContain('.confirmDanger:hover:not(:disabled) { filter: brightness(1.09); box-shadow: var(--cta-shadow-danger-hover); }');
        expect(read('src/components/dashboard/ScanMealModal.module.css')).toContain('.saveBtn:hover:not(:disabled) { box-shadow: 0 10px 24px -6px rgba(5, 150, 105, 0.6); filter: brightness(1.05); }');
        expect(read('src/pages/History.module.css')).toContain('.confirmAcceptBtn:hover {\n    filter: brightness(1.09);\n    box-shadow:');
        expect(read('src/index.css')).not.toContain('transform: scale(1.06)');
    });
});

describe('botón sólido de peligro (.ui-btn-danger + --danger-fill)', () => {
    it('el token existe en los tres temas y la clase es sombra + brillo, sin transform', () => {
        const css = read('src/index.css');
        expect(css.split('--danger-fill:').length - 1, 'claro, oscuro y papel').toBe(3);
        const i = css.indexOf('.ui-btn-danger {');
        expect(i).toBeGreaterThan(0);
        const end = css.indexOf('.ui-btn-danger:disabled', i);
        expect(end).toBeGreaterThan(i);
        const block = css.slice(i, end);
        expect(block).toContain('background: var(--danger-fill);');
        expect(block).toContain('.ui-btn-danger:hover:not(:disabled) {\n    box-shadow: var(--cta-shadow-danger-hover);\n    filter: brightness(1.06);');
        expect(block).toContain('.ui-btn-danger:active:not(:disabled) {\n    box-shadow: var(--cta-shadow-danger-active);');
        expect(block).not.toContain('transform');
    });

    it('el «Eliminar» del modal de conversación y «Eliminar mi cuenta» usan el relleno sólido', () => {
        const agent = read('src/pages/AgentPage.jsx');
        const i = agent.indexOf('onClick={confirmDeleteChat}');
        expect(i).toBeGreaterThan(0);
        const btn = agent.slice(i, i + 500);
        expect(btn).toContain('className="ui-btn-danger"');
        expect(btn).not.toContain("background: 'var(--danger)'");
        const dz = read('src/components/account/DeleteAccountSection.jsx');
        expect(dz).toContain('background: var(--danger-fill); color: #fff;');
        expect(dz).toContain('.mf-dz-btn:hover:not(:disabled) {\n    box-shadow: var(--cta-shadow-danger-hover); filter: brightness(1.06);\n}');
        expect(dz).toContain('.mf-dz-btn:active:not(:disabled) { box-shadow: var(--cta-shadow-danger-active); filter: none; }');
        expect(dz).not.toContain('translateY(-1px)');
    });
});
