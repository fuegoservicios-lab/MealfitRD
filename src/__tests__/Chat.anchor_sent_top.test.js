// [P2-CHAT-ANCHOR-SENT-TOP · 2026-09-04] Al enviar un mensaje, la conversación sube y el mensaje
// recién enviado queda ARRIBA; la respuesta crece debajo (ChatGPT/Claude/Gemini). Un espaciador al
// final reserva el sitio y se encoge con la respuesta. Y enfocar la caja ya no mueve el hilo en PC.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('src/pages/AgentPage.jsx');

describe('anclar el mensaje enviado arriba', () => {
    it('el envío fija el ancla y el autoscroll la respeta', () => {
        expect(SRC).toContain("sentAnchorRef.current = { clientMessageId, scrolled: false };");
        const i = SRC.indexOf('useEffect(() => {\n        // [P2-CHAT-ANCHOR-SENT-TOP]');
        expect(i).toBeGreaterThan(0);
        const eff = SRC.slice(i, i + 2400);
        expect(eff).toContain('const r = layoutSentAnchor();');
        expect(eff).toContain('if (!anchor.scrolled && !r.pending) scrollToSentAnchor();');
        expect(eff).toContain("if (anchor.scrolled && r.spacer === 0 && last?.isStreaming && !userScrolledUpRef.current) scrollToBottom();");
        expect(eff).toContain("scrollToIndex(idx, { align: 'start', behavior: 'smooth' })");
        expect(eff).toContain('scrollToBottom();');
        expect(eff).toContain('}, [messages, layoutSentAnchor, scrollToSentAnchor]);');
        // el scroll al ancla espera a que el espaciador esté pintado
        expect(SRC).toMatch(/useLayoutEffect\(\(\) => \{\s*scrollToSentAnchor\(\);\s*\}, \[anchorSpacerPx, scrollToSentAnchor\]\);/);
    });
    it('el layout del ancla lleva el mensaje arriba y calcula el espaciador con lo que hay debajo', () => {
        const i = SRC.indexOf('const layoutSentAnchor = useCallback(() => {');
        const body = SRC.slice(i, i + 1400);
        expect(body).toContain('el.querySelector(`[data-client-message-id="${anchor.clientMessageId}"]`)');
        expect(body).toContain('const spacer = Math.max(0, el.clientHeight - padTop - row.offsetHeight - below - 24);');
        expect(body).toContain('const pending = Math.abs(anchorSpacerRef.current - spacer) > 2;');
        const j = SRC.indexOf('const scrollToSentAnchor = useCallback(() => {');
        expect(SRC.slice(j, j + 1100)).toContain("el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })");
        // el ancla queda bajo el padding-top (cabecera fija), no bajo la cabecera
        expect(SRC.slice(j, j + 1100)).toContain('+ el.scrollTop - padTop - 12;');
        expect(SRC).toContain('<div className="anchor-spacer" aria-hidden="true" style={{ height: anchorSpacerPx, flex: \'none\' }} />');
        // el ancla se suelta al cambiar de conversación
        expect(SRC).toMatch(/sentAnchorRef\.current = null;\s*anchorSpacerRef\.current = 0;\s*setAnchorSpacerPx\(0\);\s*\}, \[currentSessionId\]\);/);
    });
    it('cada burbuja lleva su localizador y enfocar la caja solo scrollea en móvil', () => {
        expect(read('src/components/agent/MessageBubble.jsx')).toContain('data-client-message-id={msg.clientMessageId || undefined}');
        expect(SRC).toContain('onFocus={() => { if (isMobile) setTimeout(scrollToBottom, 300); }}');
        expect(SRC).not.toContain('onFocus={() => setTimeout(scrollToBottom, 300)}');
    });
});
