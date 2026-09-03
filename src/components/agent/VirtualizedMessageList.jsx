// [P1-CHAT-VIRTUALIZE · 2026-05-19] Lista virtualizada de mensajes del
// chat para sesiones largas. Cierre del último P1 pendiente del audit
// prod-readiness del Agente (2026-05-19).
//
// Por qué `react-virtuoso` y no `react-window`:
//   - Chat tiene altura variable por mensaje (texto corto / largo /
//     imagen / markdown / código) → necesitamos un virtualizer que
//     mida en runtime. react-window requiere conocer alturas con
//     anterioridad (FixedSizeList) o pasar height functions
//     (VariableSizeList con cache manual + invalidación al re-render).
//   - El último mensaje crece durante el streaming → height cambia cada
//     chunk. Virtuoso usa ResizeObserver built-in para recalibrar sin
//     plumbing manual.
//   - Scroll-anchoring "stick to bottom unless user scrolled up" es
//     trivial con Virtuoso (`followOutput="auto"`); con react-window
//     requiere ~80-100 líneas de lógica con riesgo de regresión.
//   - Bundle ~28KB gzip vs react-window 5KB. Acceptable porque el
//     componente se carga via lazy() cuando se cruza el threshold, NO en
//     el primer render del Agente.
//
// [P2-AGENT-VIRTUOSO-LAZY · 2026-05-31] El lazy() prometido arriba ahora SÍ
// está implementado: AgentPage importa este módulo via
// `lazy(() => import('./VirtualizedMessageList'))` (default export abajo) y
// lee el threshold desde `./virtualizeThreshold` (módulo liviano sin
// react-virtuoso). Pre-fix el `import { VirtualizedMessageList,
// VIRTUALIZE_THRESHOLD }` era estático → react-virtuoso caía en el chunk de
// AgentPage para el 100% de los usuarios del chat. Ahora solo se baja en
// sesiones >100 msgs. Espejo del patrón LazyMarkdown.jsx.
//
// Threshold: render virtualizado solo cuando `messages.length >
// VIRTUALIZE_THRESHOLD` (default 100). Para sesiones cortas (99% del
// uso) preservamos el path `messages.map(...)` simple — cero riesgo de
// regresión visual, cero overhead de Virtuoso.
//
// Auto-scroll: `followOutput="auto"` — si el usuario está al bottom (o
// cerca, ~150px), Virtuoso auto-scrollea al recibir mensajes nuevos /
// chunks. Si el usuario scrolleó hacia arriba para leer mensajes
// pasados, Virtuoso NO interrumpe (preserve scroll position).

import React from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Loader2 } from 'lucide-react';
import { MemoizedMessageBubble } from './MessageBubble';
import BotAvatar from './BotAvatar';
// [P2-AGENT-VIRTUOSO-LAZY · 2026-05-31] El threshold vive en su propio módulo
// liviano para que AgentPage lo lea sin importar este archivo (y con él
// react-virtuoso). Re-exportado aquí para back-compat de cualquier importador.
import { VIRTUALIZE_THRESHOLD } from './virtualizeThreshold';
import { useT, formatDate } from '../../i18n';
import { daySeparatorLabel } from '../../utils/chatTimeline';

export { VIRTUALIZE_THRESHOLD };

const ItemContent = ({ msg, index, currentSessionId, onRegenerate, onErrorRetry, daySeparator = null }) => (
    <div style={{ paddingBottom: '2rem' }}>
        <MemoizedMessageBubble
            msg={msg}
            index={index}
            currentSessionId={currentSessionId}
            onRegenerate={onRegenerate}
            onErrorRetry={onErrorRetry}
            daySeparator={daySeparator}
        />
    </div>
);

export const VirtualizedMessageList = React.forwardRef(({
    messages,
    currentSessionId,
    onRegenerate,
    onErrorRetry,
    isLoading,
    streamingStatus,
    loadingPhrases,
    loadingPhraseIdx,
    onAtBottomChange,
}, ref) => {
    const t = useT();
    const virtuosoRef = React.useRef(null);
    const atBottomRef = React.useRef(true);

    React.useImperativeHandle(ref, () => ({
        isAtBottom: () => atBottomRef.current,
        scrollToBottom: ({ behavior = 'auto' } = {}) => {
            if (!messages.length) return;
            virtuosoRef.current?.scrollToIndex({
                index: messages.length - 1,
                align: 'end',
                behavior,
            });
        },
        scrollToIndex: (index, options = {}) => {
            if (!messages.length) return;
            const safeIndex = Math.max(0, Math.min(Number(index) || 0, messages.length - 1));
            virtuosoRef.current?.scrollToIndex({ index: safeIndex, align: 'center', ...options });
        },
    }), [messages.length]);

    const handleAtBottomChange = React.useCallback((atBottom) => {
        atBottomRef.current = Boolean(atBottom);
        onAtBottomChange?.(Boolean(atBottom));
    }, [onAtBottomChange]);
    const Footer = React.useCallback(() => {
        if (!isLoading) return null;
        return (
            <div style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'center',
                color: 'var(--text-muted)',
                padding: '0.5rem 0 0.5rem 1.5rem',
                marginBottom: '3.5rem',
                fontSize: '0.95rem',
                fontWeight: 500,
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }}>
                <BotAvatar size={34} thinking style={{ flexShrink: 0 }} />
                <span style={{
                    background: 'linear-gradient(90deg, #475569 0%, #94a3b8 50%, #475569 100%)',
                    backgroundSize: '200% auto',
                    color: 'transparent',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    animation: 'shimmer 2s linear infinite',
                }}>
                    {streamingStatus || (loadingPhrases?.[loadingPhraseIdx] ?? t('Pensando...'))}
                </span>
            </div>
        );
    }, [isLoading, streamingStatus, loadingPhrases, loadingPhraseIdx, t]);

    const itemContent = React.useCallback((index, msg) => (
        <ItemContent
            msg={msg}
            index={index}
            currentSessionId={currentSessionId}
            onRegenerate={onRegenerate}
            onErrorRetry={onErrorRetry}
            daySeparator={daySeparatorLabel(msg, messages[index - 1], { t, formatDate })}
        />
    ), [currentSessionId, onRegenerate, onErrorRetry, messages, t]);

    return (
        <Virtuoso
            ref={virtuosoRef}
            data={messages}
            itemContent={itemContent}
            // Si el user está cerca del bottom, auto-scroll a nuevos
            // items; si scrolleó arriba, preservar su posición.
            followOutput="auto"
            // Scroll inicial al último mensaje (lo más reciente).
            initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
            atBottomThreshold={120}
            atBottomStateChange={handleAtBottomChange}
            components={{ Footer }}
            style={{
                height: '100%',
                width: '100%',
            }}
            // [P1-CHAT-VIRTUALIZE] aria-label propio para que screen
            // readers anuncien el scroll container del Virtuoso (el
            // role="log" aria-live="polite" del wrapper padre cubre los
            // anuncios de mensajes nuevos vía P1-CHAT-A11Y-LIVE).
            aria-label={t('Lista virtualizada de mensajes')}
        />
    );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

export default VirtualizedMessageList;
