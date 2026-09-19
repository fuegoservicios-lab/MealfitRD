// [P1-PLAN-LOTE-121 · 2026-09-19] En el teléfono la cabecera del chat es TRANSPARENTE y no dice «Bioboros 1».
// El dueño: «quiero que el encabezado sea transparente y no diga Bioboros 1 para así poder tener más espacio para que
// el usuario pueda ver el chat». Era una franja opaca de 4.5rem + zona segura con su raya, y la conversación empezaba
// debajo. Ahora quedan los dos botones flotando como fichas y la conversación pasa por debajo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'pages/AgentPage.jsx'), 'utf8').replace(/\r\n/g, '\n');
const movil = SRC.slice(SRC.indexOf('@media (max-width: 1024px) {'), SRC.indexOf('@media (min-width: 1025px) {'));
const regla = (selector) => {
    const i = movil.indexOf(`${selector} {`);
    expect(i, `no existe la regla ${selector} en el bloque del teléfono`).toBeGreaterThan(-1);
    return movil.slice(i, movil.indexOf('}', i));
};

describe('[P1-PLAN-LOTE-121] la cabecera del chat en el teléfono', () => {
    it('no es una franja: degradado opaco SOLO sobre la barra de estado, sin raya y sin desenfoque', () => {
        const r = regla('                    .mobile-chat-header');
        expect(r).toContain('background: linear-gradient(to bottom,');
        expect(r).toContain('var(--bg-card) max(env(safe-area-inset-top), 24px),');
        expect(r).toContain('transparent 100%) !important;');
        expect(r).toContain('border-bottom: 0 !important;');
        expect(r).toContain('backdrop-filter: none !important;');
    });

    it('el hueco entre los botones es chat: la franja no captura toques, sus hijos sí', () => {
        expect(regla('                    .mobile-chat-header')).toContain('pointer-events: none;');
        expect(movil).toContain('.mobile-chat-header > * { pointer-events: auto; }');
    });

    it('no dice «Bioboros 1» en el teléfono; en escritorio el rótulo sigue', () => {
        expect(movil).toContain('.agent-header-title { display: none !important; }');
        expect(SRC).toContain('<span className="agent-header-title"');
    });

    it('los dos botones flotan como fichas con fondo propio', () => {
        expect((SRC.match(/className="chat-header-btn"/g) || []).length).toBe(2);
        const r = regla('                    .chat-header-btn');
        expect(r).toContain('background: color-mix(in srgb, var(--bg-card) 92%, transparent) !important;');
        expect(r).toContain('border: 1px solid var(--border) !important;');
    });

    it('la conversación empieza ARRIBA DEL TODO y la altura de los botones va como relleno', () => {
        const r = regla('                    .messages-container');
        expect(r).toContain('margin-top: 0 !important;');
        expect(r).toContain('padding-top: calc(3.7rem + max(env(safe-area-inset-top), 24px)) !important;');
        // el anclaje del mensaje enviado descuenta ese relleno: la burbuja aterriza DEBAJO de los botones
        expect(SRC).toContain("const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;");
        expect(SRC).toMatch(/el\.scrollTop - padTop - 12\)\);/);
    });

    it('el CSS vive en un template literal: ni un acento grave en el bloque del teléfono', () => {
        expect(movil.includes('`')).toBe(false);
    });

    it('escritorio no cambia: el scroller sigue empezando debajo de su cabecera', () => {
        expect(SRC).toContain("marginTop: 'calc(4.5rem + max(env(safe-area-inset-top), 12px))',");
    });
});
