// [P2-LOCALE-POPUP-LEGIBLE · 2026-09-04] Captura del dueño (Windows, login): el desplegable
// nativo del selector de idioma salía blanco con las opciones casi invisibles — heredaban el
// color apagado de la píldora. Las opciones llevan su propia superficie y texto (tokens del
// contexto) y el login, oscuro fijo, declara `color-scheme: dark` en el control para que el
// popup del sistema se pinte en oscuro. En móvil el SO pone su rueda: no aplica.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('selector de idioma: popup nativo legible en escritorio', () => {
    it('las opciones tienen texto y fondo propios, tomados de los tokens del contexto', () => {
        const css = read('src/components/common/LocaleSwitcher.module.css');
        const i = css.indexOf('.select option {');
        expect(i).toBeGreaterThan(0);
        const block = css.slice(i, css.indexOf('}', i));
        expect(block).toContain('color: var(--mf-text, var(--text-main, #0f172a));');
        expect(block).toContain('background: var(--mf-bg-card, var(--mf-bg, var(--bg-card, #ffffff)));');
    });
    it('el login (oscuro fijo) pide el esquema oscuro al control', () => {
        const css = read('src/pages/Login.css');
        expect(css).toContain('#mf-locale-login { color-scheme: dark; }');
        expect(read('src/pages/Login.jsx')).toContain('<LocaleSwitcher id="mf-locale-login" />');
    });
});
