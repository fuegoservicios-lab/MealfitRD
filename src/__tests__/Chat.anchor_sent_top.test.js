// [P2-CHAT-SCROLL-MODES · 2026-09-04] Un solo modelo de scroll calcado de ChatGPT: 'bottom' (pegado al
// fondo), 'anchored' (el mensaje enviado arriba, la respuesta crece debajo) y 'free' (leyendo arriba).
// Sustituye a las cinco capas de P2-CHAT-ANCHOR-SENT-TOP / P2-CHAT-RELOAD-BOTTOM.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('src/pages/AgentPage.jsx');

describe('modos de scroll del chat', () => {
    it('tres modos, transiciones explícitas, pin instantáneo', () => {
        expect(SRC).toContain("const scrollModeRef = useRef('bottom');");
        expect(SRC).toContain("sentAnchorRef.current = { clientMessageId, placed: false };");
        expect(SRC).toContain("_setMode('anchored');");
        expect(SRC).toContain("if (scrollModeRef.current === 'anchored' && !force) return; // anclado: manda el ancla");
        expect(SRC).toContain("try { el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }); } catch { el.scrollTop = el.scrollHeight; }");
        expect(SRC).not.toContain('anchorSpacerPx');
        expect(SRC).not.toContain('stickToBottomRef');
    });
    it('el ancla se calcula por geometría, solo encoge, y persigue la respuesta cuando pasa de la ventana', () => {
        const i = SRC.indexOf('const _layoutAnchor = useCallback(() => {');
        const body = SRC.slice(i, SRC.indexOf('useLayoutEffect(() => {', i));
        expect(body).toContain('let spacer = Math.max(0, Math.round(rowTop + el.clientHeight - contentWithoutSpacer));');
        expect(body).toContain('if (anchor.placed && spacer > spacerPxRef.current) spacer = spacerPxRef.current; // solo encoge');
        expect(body).toContain("try { el.scrollTo({ top: rowTop, behavior: 'smooth' }); } catch { el.scrollTop = rowTop; }");
        expect(body).toContain('if (last?.isStreaming) _pinBottomInstant();');
        expect(SRC).toContain('<div ref={spacerRef} className="anchor-spacer" aria-hidden="true" style={{ height: 0, flex: \'none\' }} />');
    });
    it('subir por encima del ancla libera; bajar al fondo vuelve a pegar; la píldora solo cuando toca', () => {
        const i = SRC.indexOf('const handleMessagesScroll = useCallback(() => {');
        const body = SRC.slice(i, SRC.indexOf('const handleVirtualizedAtBottomChange', i));
        expect(body).toContain("if (a?.placed && goingUp && el.scrollTop < (a.rowTop ?? 0) - 8) {");
        expect(body).toContain("if (distanceFromBottom > 120) _setMode('free');");
        expect(body).toContain("} else if (distanceFromBottom <= 4) {");
        expect(body).toContain("setShowJumpToLatest(m === 'free' || (m === 'anchored' && distanceFromBottom > 120));");
    });
    it('cada burbuja lleva su localizador y enfocar la caja solo scrollea en móvil', () => {
        expect(read('src/components/agent/MessageBubble.jsx')).toContain('data-client-message-id={msg.clientMessageId || undefined}');
        expect(SRC).toContain('onFocus={() => { if (isMobile) setTimeout(scrollToBottom, 300); }}');
    });
});
