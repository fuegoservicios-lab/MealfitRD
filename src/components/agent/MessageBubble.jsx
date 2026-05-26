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
        background: active ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: active ? '#4f46e5' : '#64748b',
        padding: '0.4rem',
        borderRadius: '0.4rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease'
    });

    const handleMouseEnter = (e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; };
    const handleMouseLeave = (e) => { e.currentTarget.style.background = 'transparent'; };

    return (
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', marginBottom: '0.5rem', marginLeft: '-0.4rem' }}>
            <button 
                onClick={() => handleFeedback('up')} 
                style={actionBtnStyle(feedback === 'up')}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title="Buena respuesta"
                aria-label="Marcar como buena respuesta"
                aria-pressed={feedback === 'up'}
            >
                <ThumbsUp size={18} strokeWidth={2} fill={feedback === 'up' ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            <button 
                onClick={() => handleFeedback('down')} 
                style={actionBtnStyle(feedback === 'down')}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title="Mala respuesta"
                aria-label="Marcar como mala respuesta"
                aria-pressed={feedback === 'down'}
            >
                <ThumbsDown size={18} strokeWidth={2} fill={feedback === 'down' ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            <button 
                onClick={onRegenerate} 
                style={actionBtnStyle()}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title="Regenerar respuesta"
                aria-label="Regenerar respuesta"
            >
                <RefreshCw size={18} strokeWidth={2} aria-hidden="true" />
            </button>
            <button 
                onClick={handleCopy} 
                style={actionBtnStyle(copied)}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title="Copiar"
                aria-label="Copiar mensaje"
            >
                {copied ? <Check size={18} strokeWidth={2.5} aria-hidden="true" /> : <Copy size={18} strokeWidth={2} aria-hidden="true" />}
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
            background: '#ffffff',
            border: '1px solid #fca5a5',
            color: '#b91c1c',
            padding: '0.45rem 0.9rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}
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
                    color: msg.role === 'user' ? '#0f172a' : (isErrorBubble ? '#7f1d1d' : '#1e293b'),
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    background: msg.role === 'user' ? '#f0f4f8' : (isErrorBubble ? '#fef2f2' : '#ffffff'),
                    padding: msg.role === 'user' ? '0.85rem 1.4rem' : (isErrorBubble ? '0.9rem 1.1rem' : '1rem 0'),
                    borderRadius: msg.role === 'user' ? '1.5rem 1.5rem 0.25rem 1.5rem' : (isErrorBubble ? '0.85rem' : '0'),
                    border: msg.role === 'user' ? '1px solid #e2e8f0' : (isErrorBubble ? '1px solid #fecaca' : 'none'),
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
    return (
        prevProps.msg.content === nextProps.msg.content &&
        prevProps.msg.isStreaming === nextProps.msg.isStreaming &&
        prevProps.msg._isErrorBubble === nextProps.msg._isErrorBubble &&
        prevProps.msg.retryable === nextProps.msg.retryable &&
        prevProps.currentSessionId === nextProps.currentSessionId
    );
});
