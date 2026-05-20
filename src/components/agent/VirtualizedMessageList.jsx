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
//   - Bundle ~28KB gzip vs react-window 5KB. Acceptable: el componente
//     se carga via lazy() cuando se cruza el threshold, no en el
//     primer render del Agente.
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

export const VIRTUALIZE_THRESHOLD = 100;

const ItemContent = ({ msg, index, currentSessionId, onRegenerate, onErrorRetry }) => (
    <div style={{ paddingBottom: '2rem' }}>
        <MemoizedMessageBubble
            msg={msg}
            index={index}
            currentSessionId={currentSessionId}
            onRegenerate={onRegenerate}
            onErrorRetry={onErrorRetry}
        />
    </div>
);

export const VirtualizedMessageList = ({
    messages,
    currentSessionId,
    onRegenerate,
    onErrorRetry,
    isLoading,
    streamingStatus,
    loadingPhrases,
    loadingPhraseIdx,
}) => {
    const Footer = React.useCallback(() => {
        if (!isLoading) return null;
        return (
            <div style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'center',
                color: '#475569',
                padding: '0.5rem 0 0.5rem 1.5rem',
                marginBottom: '3.5rem',
                fontSize: '0.95rem',
                fontWeight: 500,
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }}>
                <div className="bot-avatar-mobile" style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', flexShrink: 0, fontSize: '1.1rem'
                }}>🤖</div>
                <span style={{
                    background: 'linear-gradient(90deg, #475569 0%, #94a3b8 50%, #475569 100%)',
                    backgroundSize: '200% auto',
                    color: 'transparent',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    animation: 'shimmer 2s linear infinite',
                }}>
                    {streamingStatus
                        ? (loadingPhrases?.[loadingPhraseIdx] ?? 'Procesando...')
                        : 'Pensando...'}
                </span>
            </div>
        );
    }, [isLoading, streamingStatus, loadingPhrases, loadingPhraseIdx]);

    const itemContent = React.useCallback((index, msg) => (
        <ItemContent
            msg={msg}
            index={index}
            currentSessionId={currentSessionId}
            onRegenerate={onRegenerate}
            // El path simple cierra sobre `msg` del .map; acá lo hacemos
            // explícito porque itemContent es estable cross-render.
            onErrorRetry={() => onErrorRetry && onErrorRetry(msg)}
        />
    ), [currentSessionId, onRegenerate, onErrorRetry]);

    return (
        <Virtuoso
            data={messages}
            itemContent={itemContent}
            // Si el user está cerca del bottom, auto-scroll a nuevos
            // items; si scrolleó arriba, preservar su posición.
            followOutput="auto"
            // Scroll inicial al último mensaje (lo más reciente).
            initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
            components={{ Footer }}
            style={{
                height: '100%',
                width: '100%',
            }}
            // [P1-CHAT-VIRTUALIZE] aria-label propio para que screen
            // readers anuncien el scroll container del Virtuoso (el
            // role="log" aria-live="polite" del wrapper padre cubre los
            // anuncios de mensajes nuevos vía P1-CHAT-A11Y-LIVE).
            aria-label="Lista virtualizada de mensajes"
        />
    );
};

export default VirtualizedMessageList;
