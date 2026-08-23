/**
 * [P1-CHAT-KEYBOARD-TABBAR · 2026-08-23] En el iPhone, al abrir el teclado en el chat del
 * Agente, la caja de escribir DESAPARECÍA: el chat reserva por dentro los 64 px de la
 * barra de pestañas (P1-CHAT-TABBAR-BACK) y esa barra es `position: fixed` — iOS la
 * recoloca justo encima del teclado, así que tapa exactamente la caja, y debajo queda
 * una franja negra. Captura del dueño, 2026-08-22 22:58.
 *
 * Con el teclado abierto no se navega: se escribe. Contrato:
 *  - el handler de visualViewport que ya calcula `--kb-inset` estampa `data-kb-open`
 *    en <html> mientras hay teclado (y lo quita al cerrarse / desmontar);
 *  - con `html[data-kb-open]` la barra de pestañas no se pinta;
 *  - y la caja de escribir deja de reservar los 64 px.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('[P1-CHAT-KEYBOARD-TABBAR] la barra de pestañas se esconde mientras hay teclado en el chat', () => {
    it('AgentPage estampa data-kb-open en <html> cuando el teclado está abierto y lo quita después', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf("setProperty('--kb-inset'");
        expect(i).toBeGreaterThan(0);
        const bloque = src.slice(i - 200, i + 900);
        expect(bloque).toMatch(/document\.documentElement\.toggleAttribute\('data-kb-open', offsetBottom > 0\)/);
        // limpieza al desmontar (cambiar de ruta con el teclado abierto no debe dejar la barra escondida)
        expect(src).toMatch(/removeAttribute\('data-kb-open'\)/);
    });

    it('BottomTabBar: display none bajo html[data-kb-open]', () => {
        const css = read('components/dashboard/BottomTabBar.module.css');
        expect(css).toMatch(/:global\(html\[data-kb-open\]\) \.tabBar\s*\{\s*display:\s*none/);
    });

    it('la caja de escribir del chat deja de reservar los 64 px con el teclado abierto', () => {
        const src = read('pages/AgentPage.jsx');
        expect(src).toMatch(/html\[data-kb-open\] \.input-wrapper\s*\{[^}]*padding-bottom:\s*0\.8rem !important/);
    });
});
