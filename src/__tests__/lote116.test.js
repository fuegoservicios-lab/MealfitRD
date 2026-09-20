// [P1-PLAN-LOTE-116 · 2026-09-19] «Cuando le mando una foto o cualquier mensaje, el sistema dura mucho en redirigir
// hacia la respuesta»: con el teclado virtual abierto la ventana de lectura mide ~200 px y la respuesta nacía fuera de
// cuadro. Enviar cierra el teclado (como ChatGPT/Gemini), el ancla recupera el alto que gana la ventana, y una foto
// enviada deja SIEMPRE el chat mirando al final.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');

describe('enviar con el teclado virtual abierto', () => {
    // [P1-PLAN-LOTE-130 · 2026-09-19] El dueño REVIRTIÓ el cierre: «haz lo mismo con el + y enviar» (que no cierren el
    // teclado). Lo que el lote 116 protegía —que la respuesta no nazca fuera de cuadro en una ventana de ~300 px— se
    // conserva de otra forma: con el teclado en pantalla el envío va en modo «abajo» (la vista sigue a la respuesta).
    it('YA NO lo cierra: conserva el foco, y con el teclado en pantalla la vista sigue a la respuesta', () => {
        const i = src.indexOf('const _tecladoVirtual = tecladoAbiertoRef.current || medirTecladoDeVentana(window).abierto;');
        expect(i).toBeGreaterThan(-1);
        const bloque = src.slice(i, i + 700);
        expect(bloque).not.toContain('chatInputRef.current?.blur()');
        expect(bloque).toMatch(/if \(_hadFocusPreSend && !callModeRef\.current\) \{\s*setTimeout\(/);
        expect(bloque).toContain('if (document.activeElement !== chatInputRef.current) chatInputRef.current?.focus({ preventScroll: true });');
        expect(src).toMatch(/\} else if \(_tecladoVirtual\) \{[\s\S]{0,700}sentAnchorRef\.current = null;\s*_setSpacer\(0\);\s*_setMode\('bottom'\);/);
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
