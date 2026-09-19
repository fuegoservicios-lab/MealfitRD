// [P1-PLAN-LOTE-116 · 2026-09-19] «Cuando le mando una foto o cualquier mensaje, el sistema dura mucho en redirigir
// hacia la respuesta»: con el teclado virtual abierto la ventana de lectura mide ~200 px y la respuesta nacía fuera de
// cuadro. Enviar cierra el teclado (como ChatGPT/Gemini), el ancla recupera el alto que gana la ventana, y una foto
// enviada deja SIEMPRE el chat mirando al final.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');

describe('enviar con el teclado virtual abierto', () => {
    it('lo cierra; con teclado físico se conserva el foco para seguir escribiendo', () => {
        const i = src.indexOf('const _tecladoVirtual = tecladoAbiertoRef.current || medirTecladoDeVentana(window).abierto;');
        expect(i).toBeGreaterThan(-1);
        const bloque = src.slice(i, i + 600);
        expect(bloque).toMatch(/if \(_hadFocusPreSend && _tecladoVirtual\) \{\s*try \{ chatInputRef\.current\?\.blur\(\); \}/);
        expect(bloque).toMatch(/\} else if \(_hadFocusPreSend && !callModeRef\.current\) \{\s*setTimeout\(\(\) => \{\s*try \{ chatInputRef\.current\?\.focus\(\); \}/);
    });
});

describe('el ancla y la ventana', () => {
    it('el espaciador solo encoge… salvo cuando lo que cambió es la VENTANA', () => {
        expect(src).toContain('const ventanaCambio = ventanaCambioRef.current === true;');
        expect(src).toMatch(/if \(!ventanaCambio\) \{\s*if \(anchor\.placed && spacer > spacerPxRef\.current\) spacer = spacerPxRef\.current; \/\/ solo encoge/);
        expect(src).toContain('} else if (ventanaCambio && spacerPxRef.current > 0) {');
        expect(src).toContain('ventanaCambioRef.current = delta !== 0;');
        expect(src).toContain('try { _layoutAnchor(); } finally { ventanaCambioRef.current = false; }');
    });
    it('una foto enviada deja el chat en modo «abajo» aunque viniera de leer más arriba', () => {
        const i = src.indexOf('attachments: bubbleAttachments,');
        const bloque = src.slice(i, i + 700);
        expect(bloque).toContain('sentAnchorRef.current = null;');
        expect(bloque).toContain("_setMode('bottom');");
    });
});
