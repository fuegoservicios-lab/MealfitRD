// [P2-IOS-FOCUS-RING-ROOTS · 2026-09-04] Captura del dueño en iPhone: un anillo azul rodeaba el
// menú del botón ☰ y el diálogo de cerrar sesión. Es el anillo de foco por defecto de Safari:
// `useModalAccessibility` enfoca el contenedor raíz por código al abrir, y WebKit lo pinta
// también cuando el foco lo pone un script tras un toque (Chrome lo oculta). Solo el modal
// genérico tenía la regla (P2-MODAL-OUTLINE-A11Y); ahora hay UNA regla para todos los raíces
// `role="dialog|alertdialog|menu"` + `tabIndex={-1}`: sin contorno en `:focus`, anillo de
// teclado solo con puntero fino.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const CSS = read('src/index.css');
const block = (css, selector) => {
    const i = css.indexOf(selector);
    expect(i, `falta ${selector}`).toBeGreaterThan(0);
    return css.slice(i, css.indexOf('}', i));
};

describe('anillo de foco en raíces enfocables por código', () => {
    it('los raíces dialog/alertdialog/menu con tabindex=-1 no llevan contorno en :focus', () => {
        const b = block(CSS, '[role="dialog"][tabindex="-1"]:focus,');
        expect(b).toContain('[role="alertdialog"][tabindex="-1"]:focus,');
        expect(b).toContain('[role="menu"][tabindex="-1"]:focus {');
        expect(b).toContain('outline: none;');
    });

    it('el anillo de teclado vive SOLO bajo puntero fino, también para el modal genérico', () => {
        const i = CSS.indexOf('@media (hover: hover) and (pointer: fine) {\n  [role="dialog"][tabindex="-1"]:focus-visible,');
        expect(i).toBeGreaterThan(0);
        const media = CSS.slice(i, CSS.indexOf('\n}\n', i));
        expect(media).toContain('[role="menu"][tabindex="-1"]:focus-visible,');
        // el modal genérico va ÚLTIMO en el grupo: el ancla del backend (test_p2_modal_outline_a11y)
        // busca `.mealfit-modal-content:focus-visible {` con la llave pegada
        expect(media).toContain('.mealfit-modal-content:focus-visible {');
        expect(media).toContain('outline: 3px solid rgba(79, 70, 229, 0.65);');
        // la regla incondicional anterior desapareció: en iOS pintaba el anillo al abrir
        expect(CSS.split('.mealfit-modal-content:focus-visible').length - 1).toBe(1);
        expect(block(CSS, '.mealfit-modal-content:focus {')).toContain('outline: none;');
    });

    it('los dos raíces de la captura llevan role + tabIndex={-1} (los que cubre la regla)', () => {
        const layout = read('src/components/dashboard/DashboardLayout.jsx');
        expect(layout).toMatch(/className=\{styles\.mobileMoreMenu\} role="menu" ref=\{moreMenuRef\} tabIndex=\{-1\}/);
        const logout = read('src/components/dashboard/LogoutConfirmModal.jsx');
        expect(logout).toContain('role="dialog"');
        expect(logout).toContain('tabIndex={-1}');
    });
});
