// [P1-PLAN-LOTE-130 · 2026-09-19] «+» y ENVIAR no se llevan el teclado.
//
// El dueño, tras confirmar que la X de la foto ya no lo cierra: «ahora haz lo mismo con el + y enviar».
//   · Con el teclado abierto los dos ya actúan en `pointerdown`, pero el foco no se va ahí: se va cuando WebKit sintetiza
//     mousedown/click tras el `touchend`. Si el gesto ya se atendió, el `touchend` se cancela.
//   · ENVIAR además hacía `blur()` a propósito (lote 116). El dueño lo revierte; lo que aquel lote protegía (que la
//     respuesta no nazca fuera de cuadro) se conserva enviando en modo «abajo» mientras el teclado siga en pantalla.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ap = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 130 · «+» y ENVIAR no le quitan el foco a la caja', () => {
    it('si el gesto YA se atendió en pointerdown, el touchend se cancela (sin click sintetizado, el foco no se mueve)', () => {
        const k = ap.indexOf("const handleComposerTouchEnd = (action) => (event) => {");
        const cuerpo = ap.slice(k, ap.indexOf('\n    };', k));
        expect(cuerpo).toContain('if (!event.cancelable || pending.action !== action || Date.now() > pending.expiresAt) return;');
        expect(cuerpo).toContain('event.preventDefault();');
    });

    it('si NO se atendió en pointerdown (sin teclado, Safari normal) no se toca nada: la acción llega por el click', () => {
        // la guarda de arriba sale ANTES de cancelar: un touchend cancelado sin acción previa dejaría el botón muerto
        const k = ap.indexOf("const handleComposerTouchEnd = (action) => (event) => {");
        const cuerpo = ap.slice(k, ap.indexOf('\n    };', k));
        expect(cuerpo.indexOf('return;')).toBeLessThan(cuerpo.indexOf('event.preventDefault();'));
    });

    it('los dos botones lo llevan, y el mousedown cancelado cubre el ratón', () => {
        expect(ap).toContain("onTouchEnd={handleComposerTouchEnd('attachment')}");
        expect(ap).toContain("onTouchEnd={handleComposerTouchEnd('send')}");
        expect(ap.split('onMouseDown={keepComposerFocus}').length - 1).toBe(2);
        // y siguen actuando en pointerdown (P0-CHAT-IOS-APP-BOTONES-CON-TECLADO): eso no cambia
        expect(ap).toContain('onPointerDown={handleAttachmentPointerDown}');
        expect(ap).toContain('onPointerDown={handleSendPointerDown}');
    });
});

// [P1-PLAN-LOTE-134 · 2026-09-20] El dueño restaura el cierre AL ENVIAR («que se cierre automáticamente el teclado para
// enfocarnos en el mensaje»). De este lote siguen en pie el «+» (arriba) y lo que no depende del cierre:
describe('lote 130 · lo que sigue en pie tras el lote 134', () => {
    it('el foco solo se retoma si de verdad se fue (teclado físico)', () => {
        const i = ap.indexOf('const _tecladoVirtual = tecladoAbiertoRef.current || medirTecladoDeVentana(window).abierto;');
        const bloque = ap.slice(i, i + 700);
        expect(bloque).toContain('if (document.activeElement !== chatInputRef.current) chatInputRef.current?.focus();');
    });

    it('si el teclado se queda en pantalla el envío sigue a la respuesta (modo «abajo»); si no, ancla el mensaje arriba', () => {
        expect(ap).toMatch(/\} else if \(_tecladoVirtual && !_cierraTeclado\) \{[\s\S]{0,700}_setMode\('bottom'\);\s*\} else \{[\s\S]{0,300}_setMode\('anchored'\);/);
    });
});
