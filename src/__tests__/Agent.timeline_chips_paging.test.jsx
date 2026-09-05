// [P2-CHAT-TIMELINE + P2-CHAT-QUICK-CHIPS + P2-CHAT-SESSIONS-PAGING · 2026-09-03] Lo que faltaba
// para que el chat aguante charlas largas: separadores de día y hora por mensaje, acciones rápidas
// mientras el hilo es corto, y «Ver más» en Recientes en vez de un tope silencioso de 60.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { daySeparatorLabel, timeLabel, messageDate, previousDatedMessage } from '../utils/chatTimeline';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const AGENT = read('src/pages/AgentPage.jsx');
const BUBBLE = read('src/components/agent/MessageBubble.jsx');
const VIRT = read('src/components/agent/VirtualizedMessageList.jsx');
const SIDEBAR = read('src/components/agent/SidebarRecientes.jsx');
const CSS = read('src/components/agent/MessageBubble.css');

const t = (k) => k;
const formatDate = (d, o) => new Intl.DateTimeFormat('es-DO', o).format(d);
const now = new Date(2026, 8, 3, 15, 0, 0); // 3 sep 2026 15:00 local

describe('chatTimeline (puro)', () => {
    it('solo marca los cambios de día: el arranque del hilo no lleva etiqueta', () => {
        const hoy = { created_at: new Date(2026, 8, 3, 9, 5).toISOString() };
        const ayer = { created_at: new Date(2026, 8, 2, 22, 0).toISOString() };
        const agosto = { created_at: new Date(2026, 7, 24, 8, 0).toISOString() };
        const anno = { created_at: new Date(2025, 11, 31, 8, 0).toISOString() };
        // primer mensaje del hilo: nada (un hilo de un día no muestra «Hoy»)
        expect(daySeparatorLabel(hoy, null, { t, formatDate, now })).toBeNull();
        expect(daySeparatorLabel(agosto, null, { t, formatDate, now })).toBeNull();
        // cambios de día dentro del hilo
        expect(daySeparatorLabel(hoy, ayer, { t, formatDate, now })).toBe('Hoy');
        expect(daySeparatorLabel(ayer, agosto, { t, formatDate, now })).toBe('Ayer');
        expect(daySeparatorLabel(agosto, anno, { t, formatDate, now })).toMatch(/24 de agosto/);
        expect(daySeparatorLabel(anno, { created_at: new Date(2025, 11, 30).toISOString() }, { t, formatDate, now })).toMatch(/2025/);
        expect(daySeparatorLabel(hoy, { created_at: new Date(2026, 8, 3, 8, 0).toISOString() }, { t, formatDate, now })).toBeNull();
    });
    it('una burbuja local sin fecha en medio no provoca un segundo «Hoy»', () => {
        const a = { created_at: new Date(2026, 8, 3, 9, 0).toISOString() };
        const stop = { role: 'model', content: '⏹ Detenido', _isErrorBubble: true };
        const b = { created_at: new Date(2026, 8, 3, 12, 0).toISOString() };
        const msgs = [a, stop, b];
        expect(previousDatedMessage(msgs, 2)).toBe(a);
        expect(daySeparatorLabel(b, previousDatedMessage(msgs, 2), { t, formatDate, now })).toBeNull();
        expect(daySeparatorLabel(b, a, { t, formatDate, now })).toBeNull();   // mismo día: sin etiqueta
    });
    it('sin fecha no hay separador ni hora; el saludo usa welcomeAt', () => {
        expect(daySeparatorLabel({ content: 'x' }, null, { t, formatDate, now })).toBeNull();
        expect(timeLabel({ content: 'x' }, formatDate)).toBe('');
        expect(messageDate({ welcomeAt: now.getTime() }).getTime()).toBe(now.getTime());
        expect(timeLabel({ created_at: new Date(2026, 8, 3, 14, 32).toISOString() }, formatDate)).toMatch(/2:32|14:32/);
    });
});

describe('hilo: fecha en los mensajes y separadores en los dos renders', () => {
    it('todo mensaje nace o llega con created_at', () => {
        expect(AGENT).toContain('created_at: m.created_at || undefined,   // [P2-CHAT-TIMELINE]');
        expect(AGENT).toContain("newMessages.push({ role: 'user', content: userMsg, clientMessageId, created_at: new Date().toISOString() });");
        expect(AGENT).toContain("{ role: 'model', content: displayContent, isStreaming: true, created_at: new Date().toISOString() }");
        expect(AGENT).toContain("{ role: 'model', content: fullText, created_at: new Date().toISOString() }");
    });
    it('render simple y virtualizado calculan el separador con la misma función', () => {
        expect(AGENT).toContain('daySeparator={daySeparatorLabel(msg, previousDatedMessage(messages, i), { t, formatDate })}');
        expect(VIRT).toContain('daySeparator={daySeparatorLabel(msg, previousDatedMessage(messages, index), { t, formatDate })}');
        expect(VIRT).toContain('[currentSessionId, onRegenerate, onErrorRetry, messages, t]');
    });
    it('la burbuja pinta el separador; la hora solo vive como tooltip (el dueño la vio innecesaria)', () => {
        expect(BUBBLE).toContain('<div className="msg-day-sep" role="separator" aria-label={daySeparator}>');
        expect(BUBBLE).toContain('title={_hora || undefined}');
        expect(BUBBLE).not.toContain('msg-time');
        expect(CSS).not.toContain('.msg-time');
        expect(BUBBLE).toContain('prevProps.daySeparator === nextProps.daySeparator &&');
        expect(BUBBLE).toContain('prevProps.msg.created_at === nextProps.msg.created_at &&');
        expect(CSS).toContain('.msg-day-sep span {');
    });
});

describe('acciones rápidas con el hilo corto', () => {
    it('tres chips que mandan directo, solo con ≤4 mensajes, sin turno activo y caja vacía', () => {
        // [P2-CHAT-CHIPS-MOBILE-ONLY · 2026-09-05] La guarda gana `isMobile &&` por delante: en PC los tres
        // atajos ocupaban una fila entera sobre la caja sin ahorrar nada (el teclado ya está delante). Las
        // cinco condiciones que este test vigila —hilo corto, sin turno activo, caja vacía— siguen intactas.
        expect(AGENT).toContain('{isMobile && !isCentered && messages.length > 0 && messages.length <= 4 && !isTurnActive && !isLoadingHistory && !input.trim() && (');
        // dentro del wrapper sticky de la caja (fuera, la caja los tapaba en escritorio)
        expect(AGENT.indexOf('className="chat-quick-chips"')).toBeGreaterThan(AGENT.indexOf('const renderInputArea = (isCentered = false) => ('));
        expect(AGENT.indexOf('className="chat-quick-chips"')).toBeLessThan(AGENT.indexOf("<div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', minWidth: 0, position: 'relative' }}>"));
        expect(AGENT).toContain("[t('¿Qué me toca ahora?'), t('Registrar lo que comí'), t('Cambiar un plato')]");
        expect(AGENT).toContain('onClick={() => handleSend(texto)}');
        expect(AGENT).toContain('.chat-quick-chip {');
        // el hilo nunca desplaza en horizontal (barra gruesa al pie del hilo en Windows)
        expect(AGENT).toContain('.messages-container { overflow-x: hidden !important; }');
    });
});

describe('Recientes: «Ver más»', () => {
    it('pagina por offset, anexa sin duplicar y solo para cuentas', () => {
        expect(AGENT).toContain('const fetchChatSessions = useCallback(async (offset = 0) => {');
        expect(AGENT).toContain('if (!isGuest && offset > 0) url += `?offset=${offset}`;');
        expect(AGENT).toContain('setHasMoreSessions(!isGuest && data.has_more === true);');
        expect(AGENT).toContain('const base = offset > 0 ? prev.filter(s => !newSessions.some(n => n.id === s.id)) : [];');
        expect(AGENT).toContain('await fetchChatSessions(chatSessions.length);');
        expect(SIDEBAR).toContain("{hasMoreSessions && typeof onLoadMoreSessions === 'function' && (");
        expect(SIDEBAR).toContain("{isLoadingMoreSessions ? t('Cargando…') : t('Ver más')}");
    });
    it('catálogos: claves nuevas en los 4 idiomas', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            for (const k of ['¿Qué me toca ahora?', 'Registrar lo que comí', 'Cambiar un plato', 'Ver más', 'Acciones rápidas', 'Hoy', 'Ayer']) {
                expect(cat[k], `${loc}: ${k}`).toBeTruthy();
            }
        }
    });
});
