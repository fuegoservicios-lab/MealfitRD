// [P2-LOCALE-POPUP-LEGIBLE · 2026-09-04] Captura del dueño (Windows, login): el desplegable
// nativo del selector de idioma salía blanco con las opciones casi invisibles — heredaban el
// color apagado de la píldora. Primer arreglo: opciones con superficie y texto propios +
// `color-scheme: dark` en el login. Segunda captura del mismo día: al pasar el ratón el texto
// de la píldora DESAPARECÍA (el hover cambiaba `color` a un fallback oscuro) y el popup nativo,
// que no se puede vestir, seguía viéndose tosco.
// [P2-LOCALE-LISTBOX-DESKTOP · 2026-09-04] Con puntero fino el selector es un listbox PROPIO
// (tokens del contexto, animación breve, teclado); el <select> nativo queda para táctil.
// El hover jamás toca `color`: el feedback es un tinte de fondo sobre `currentColor`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const block = (css, selector) => {
    const i = css.indexOf(selector);
    expect(i, `falta ${selector}`).toBeGreaterThan(0);
    return css.slice(i, css.indexOf('}', i));
};

describe('selector de idioma: nítido y legible en escritorio', () => {
    const css = read('src/components/common/LocaleSwitcher.module.css');
    const jsx = read('src/components/common/LocaleSwitcher.jsx');

    it('las opciones del <select> nativo tienen texto y fondo propios, tomados de los tokens del contexto', () => {
        const b = block(css, '.select option {');
        expect(b).toContain('color: var(--mf-text, var(--text-main, #0f172a));');
        expect(b).toContain('background: var(--mf-bg-card, var(--mf-bg, var(--bg-card, #ffffff)));');
    });

    it('el hover NO cambia el color del texto (era lo que lo hacía desaparecer) ni mueve el control', () => {
        const hover = block(css, '.pill:hover:not(:disabled),');
        expect(hover).not.toMatch(/\n\s*color:/);
        expect(hover).not.toContain('transform');
        expect(hover).toContain('background-color: color-mix(in srgb, currentColor 9%, transparent);');
        expect(block(css, '.pill,')).toContain('color: var(--mf-text, var(--text-main, inherit));');
    });

    it('con puntero fino es un listbox propio (tokens, teclado); en táctil, el <select> nativo', () => {
        expect(jsx).toContain("const coarse = useMediaQuery('(pointer: coarse)');");
        expect(jsx).toContain('if (coarse) {');
        expect(jsx).toContain('role="listbox"');
        expect(jsx).toContain('aria-haspopup="listbox"');
        expect(jsx).toContain('role="option"');
        for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter']) expect(jsx).toContain(`case '${key}':`);
        expect(jsx).toContain("if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }");
        const menu = block(css, '.menu {');
        expect(menu).toContain('background: var(--mf-bg-card, var(--bg-card, #ffffff));');
        expect(menu).toContain('color: var(--mf-text, var(--text-main, #0f172a));');
        expect(menu).toContain('border-radius: 12px;');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('el login (oscuro fijo) pide el esquema oscuro al control y le da superficie de tarjeta propia', () => {
        const login = read('src/pages/Login.css');
        expect(login).toContain('#mf-locale-login { color-scheme: dark; }');
        expect(block(login, '.mf-brandmark--with-locale {\n  --mf-bg-card')).toContain('--mf-bg-card: #0F1626;');
        expect(read('src/pages/Login.jsx')).toContain('<LocaleSwitcher id="mf-locale-login" />');
    });
});
