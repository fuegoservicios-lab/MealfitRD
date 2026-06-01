import React, { useState } from 'react';
// [P3-LAZY-MARKDOWN · 2026-05-12] react-markdown movido a chunk async via
// wrapper LazyMarkdown (Suspense + lazy import). Reduce el chunk AgentPage
// porque react-markdown + remark deps (~60KB gzip) solo se descargan tras
// el primer render de markdown.
import LazyMarkdown from '../common/LazyMarkdown';
import { ThumbsUp, ThumbsDown, RefreshCw, Copy, Check } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';

const MessageActions = ({ content, sessionId, onRegenerate }) => {
    const [copied, setCopied] = useState(false);
    const [feedback, setFeedback] = useState(null);

    const triggerHaptic = (pattern = 40) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    };

    const handleFeedback = async (type) => {
        triggerHaptic(40);
        const newFeedback = feedback === type ? null : type;
        setFeedback(newFeedback); // Optimistic UI update
        try {
            await fetchWithAuth('/api/chat/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, content, feedback: newFeedback })
            });
        } catch (error) {
            console.error('Error saving feedback:', error);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const actionBtnStyle = (active = false) => ({
        background: active ? 'rgba(129, 140, 248, 0.12)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: active ? 'var(--primary)' : 'var(--text-muted)',
        padding: '0.4rem',
        borderRadius: '0.4rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease'
    });

    const handleMouseEnter = (e) => { e.currentTarget.style.background = 'var(--bg-muted)'; };
    const handleMouseLeave = (e) => { e.currentTarget.style.background = 'transparent'; };

    return (
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', marginBottom: '0.5rem', marginLeft: '-0.4rem' }}>
            <button 
                onClick={() => handleFeedback('up')} 
                style={actionBtnStyle(feedback === 'up')}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title="Buena respuesta"
            >
                <ThumbsUp size={18} strokeWidth={2} fill={feedback === 'up' ? 'currentColor' : 'none'} />
            </button>
            <button 
                onClick={() => handleFeedback('down')} 
                style={actionBtnStyle(feedback === 'down')}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title="Mala respuesta"
            >
                <ThumbsDown size={18} strokeWidth={2} fill={feedback === 'down' ? 'currentColor' : 'none'} />
            </button>
            <button 
                onClick={onRegenerate} 
                style={actionBtnStyle()}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title="Regenerar respuesta"
            >
                <RefreshCw size={18} strokeWidth={2} />
            </button>
            <button 
                onClick={handleCopy} 
                style={actionBtnStyle(copied)}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title="Copiar"
            >
                {copied ? <Check size={18} strokeWidth={2.5} /> : <Copy size={18} strokeWidth={2} />}
            </button>
        </div>
    );
};

// [P1-CHAT-ERROR-DIFF · 2026-05-19] Botón inline "Reintentar" para los
// bubbles de error generados por _buildAgentErrorMessage. Solo se renderiza
// si msg.retryable === true (errores no-retryables como 402 quota o 401/403
// auth muestran solo el copy explicativo). Sin styles inline pesados; el
// botón hereda paleta error (rojo).
const ErrorRetryButton = ({ onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label="Reintentar el último mensaje"
        style={{
            marginTop: '0.75rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'var(--bg-card)',
            border: '1px solid #fca5a5',
            color: 'var(--danger-text)',
            padding: '0.45rem 0.9rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger-bg)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; }}
    >
        <RefreshCw size={15} strokeWidth={2.2} />
        Reintentar
    </button>
);

export const MemoizedMessageBubble = React.memo(({ msg, index, currentSessionId, onRegenerate, onErrorRetry }) => {
    // [P1-CHAT-ERROR-DIFF · 2026-05-19] Variante visual para errores:
    // role="alert" (anuncio a screen readers — defensa-en-profundidad
    // mientras el aria-live container-level sigue pendiente), borde rojo
    // sutil, NO MessageActions (thumbs/regenerate no aplican).
    const isErrorBubble = msg.role === 'model' && msg._isErrorBubble === true;
    return (
        <div style={{
            display: 'flex',
            gap: '0.75rem',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-start'
        }}>
            {msg.role === 'model' && (
                <div className="bot-avatar-mobile" style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', flexShrink: 0,
                    marginTop: '14px',
                    fontSize: '1.1rem'
                }}>
                    🤖
                </div>
            )}

            {/* Mensaje */}
            <div
                {...(isErrorBubble ? { role: 'alert' } : {})}
                {...(msg.role === 'model' && msg.isStreaming ? { 'aria-busy': true } : {})}
                className={msg.role === 'user' ? 'msg-bubble-user' : 'msg-bubble-bot'}
                style={{
                    flex: msg.role === 'user' ? '0 1 auto' : 1,
                    maxWidth: msg.role === 'user' ? '80%' : '100%',
                    width: msg.role === 'user' ? 'fit-content' : 'auto',
                    color: msg.role === 'user' ? 'var(--text-main)' : (isErrorBubble ? 'var(--danger-text)' : 'var(--text-main)'),
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    background: msg.role === 'user' ? 'var(--bg-muted)' : (isErrorBubble ? 'var(--danger-bg)' : 'var(--bg-card)'),
                    padding: msg.role === 'user' ? '0.85rem 1.4rem' : (isErrorBubble ? '0.9rem 1.1rem' : '1rem 0'),
                    borderRadius: msg.role === 'user' ? '1.5rem 1.5rem 0.25rem 1.5rem' : (isErrorBubble ? '0.85rem' : '0'),
                    border: msg.role === 'user' ? '1px solid var(--border)' : (isErrorBubble ? '1px solid #fecaca' : 'none'),
                    boxShadow: 'none'
                }}
            >
                {msg.isImage && msg.imageUrl && (
                    <div style={{ marginBottom: msg.content ? '0.5rem' : 0 }}>
                        <img
                            src={msg.imageUrl}
                            alt="Imagen enviada"
                            style={{
                                maxWidth: '280px',
                                width: '100%',
                                borderRadius: '0.75rem',
                                maxHeight: '280px',
                                objectFit: 'cover',
                                display: 'block'
                            }}
                        />
                    </div>
                )}
                {msg.content && msg.content !== '📷 Imagen enviada' && (
                    <div className="markdown-chat">
                        <LazyMarkdown>{msg.content}</LazyMarkdown>
                    </div>
                )}

                {/* [P1-CHAT-ERROR-DIFF · 2026-05-19] Botón retry solo si
                    msg.retryable; el copy del bubble ya comunica el por qué */}
                {isErrorBubble && msg.retryable && typeof onErrorRetry === 'function' && (
                    <ErrorRetryButton onClick={onErrorRetry} />
                )}

                {/* Action bar for model messages — oculto en errores */}
                {msg.role === 'model' && !msg.isStreaming && !isErrorBubble && (
                    <MessageActions
                        content={msg.content}
                        sessionId={currentSessionId}
                        onRegenerate={() => onRegenerate(index)}
                    />
                )}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Only re-render if the message content, streaming status, or session changes
    // [P2-CHAT-IMG-SWAP-RERENDER · 2026-06-01] imageUrl/isImage añadidos: tras subir
    // una imagen, el swap blob→URL-de-servidor crea un objeto-mensaje nuevo y debe
    // re-renderizar la burbuja ANTES de revocar el blob (si no, <img> queda apuntando
    // a un blob revocado = imagen rota hasta un reload).
    return (
        prevProps.msg.content === nextProps.msg.content &&
        prevProps.msg.isStreaming === nextProps.msg.isStreaming &&
        prevProps.msg._isErrorBubble === nextProps.msg._isErrorBubble &&
        prevProps.msg.retryable === nextProps.msg.retryable &&
        prevProps.msg.imageUrl === nextProps.msg.imageUrl &&
        prevProps.msg.isImage === nextProps.msg.isImage &&
        prevProps.currentSessionId === nextProps.currentSessionId
    );
});
