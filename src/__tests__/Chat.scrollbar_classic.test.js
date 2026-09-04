// [P2-CHAT-SCROLLBAR-CLASSIC · 2026-09-04] El chat y la barra lateral llevaban un pulgar de 6 px
// sobre pista transparente (invisible en oscuro, sin flechas). Ahora: barra clásica de 12 px con
// pista visible, pulgar siempre visible y botones de subir/bajar con triángulo SVG.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');

describe('scrollbar clásica del chat', () => {
    it('12 px, pista visible, pulgar redondeado y flechas en los extremos', () => {
        expect(SRC).toContain('html .sidebar-scrollable::-webkit-scrollbar, html .messages-container::-webkit-scrollbar {\n                    width: 12px;');
        expect(SRC).toContain('::-webkit-scrollbar-button:vertical:decrement');
        expect(SRC).toContain('::-webkit-scrollbar-button:vertical:increment');
        expect(SRC).toMatch(/scrollbar-button \{\s*display: block;\s*height: 14px;/);
        // Chromium: sin scrollbar-color/width en el elemento (desactivarían las flechas); Firefox lo recibe bajo @supports
        expect(SRC).toContain('@supports not selector(::-webkit-scrollbar) {');
        expect(SRC).toContain("scrollbar-color: rgba(148, 163, 184, 0.7) rgba(148, 163, 184, 0.12);");
        // al recargar, al fondo de verdad
        // al refrescar, nada se anima: ventana de 2 s con scroll instantáneo
        // asentar y revelar: invisible hasta que la altura se estabiliza, luego ya abajo
        expect(SRC).toContain("visibility: threadSettling ? 'hidden' : 'visible'");
        expect(SRC).toContain('settleTimerRef.current = setTimeout(_revealThread, 150);');
        expect(SRC).toContain('settleCapRef.current = setTimeout(_revealThread, 900);');
        expect(SRC).toContain('if (settleTimerRef.current) { _pinBottomInstant(); _armSettle(); return; }');
        expect(SRC).toContain('if (!(messagesRef.current?.length > 0)) _beginSettle();');
        expect(SRC).toContain('const ro = new ResizeObserver(() => {');
        expect(SRC).not.toContain('[0, 250, 900].forEach');
        // el scroller empieza debajo de la cabecera absoluta: el botón de subir queda a la vista
        expect(SRC).toContain("marginTop: 'calc(4.5rem + max(env(safe-area-inset-top), 12px))',");
        expect(SRC).toContain("padding: messages.length === 0 ? '1.25rem 1.5rem 0 1.5rem' : '1.25rem 2rem 0.5rem 2rem',");
        // y el cuadro de escribir no se superpone al final del scroller en PC (botón de bajar visible)
        expect(SRC).toContain("position: isCentered ? 'absolute' : (isMobile ? 'sticky' : 'relative'),");
        expect(SRC).toContain("marginBottom: (!isCentered && !isMobile) ? '1.25rem' : 0,");
        expect(SRC).not.toContain('.messages-container::-webkit-scrollbar {\n                    width: 6px;');
    });
});
