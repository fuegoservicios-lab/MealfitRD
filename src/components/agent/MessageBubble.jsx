import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
// [P3-BOT-AVATAR-3D · 2026-06-19] Avatar del bot = orbe 3D glossy de alto contraste
// (reemplaza el emoji 🤖 / robot lineal que casi no se veía sobre el degradado).
import BotAvatar from './BotAvatar';
// [P3-LAZY-MARKDOWN · 2026-05-12] react-markdown movido a chunk async via
// wrapper LazyMarkdown (Suspense + lazy import). Reduce el chunk AgentPage
// porque react-markdown + remark deps (~60KB gzip) solo se descargan tras
// el primer render de markdown.
import LazyMarkdown from '../common/LazyMarkdown';
import { ThumbsUp, ThumbsDown, RefreshCw, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import { useT } from '../../i18n';
import { toast } from 'sonner';
import { triggerMobileHaptic } from '../../utils/mobileHaptics';
import './MessageBubble.css';

const MessageActions = ({ content, sessionId, onRegenerate, showRegenerate = true }) => {
    const t = useT();
    const [copied, setCopied] = useState(false);
    const [feedback, setFeedback] = useState(null);

    const handleFeedback = async (type) => {
        triggerMobileHaptic('light');
        const newFeedback = feedback === type ? null : type;
        const previousFeedback = feedback;
        setFeedback(newFeedback); // Optimistic UI update
        try {
            const response = await fetchWithAuth('/api/chat/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, content, feedback: newFeedback })
            });
            if (!response.ok) throw new Error(`feedback_${response.status}`);
        } catch (error) {
            setFeedback(previousFeedback);
            console.error('Error saving feedback:', error);
            triggerMobileHaptic('error');
            toast.error(t('No pudimos guardar tu valoración. Inténtalo de nuevo.'));
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content);
            triggerMobileHaptic('success');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Error copying chat response:', error);
            triggerMobileHaptic('error');
            toast.error(t('No pudimos copiar la respuesta.'));
        }
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
        minWidth: 44,
        minHeight: 44,
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
                title={t('Buena respuesta')}
                aria-label={t('Buena respuesta')}
                aria-pressed={feedback === 'up'}
            >
                <ThumbsUp size={18} strokeWidth={2} fill={feedback === 'up' ? 'currentColor' : 'none'} />
            </button>
            <button 
                onClick={() => handleFeedback('down')} 
                style={actionBtnStyle(feedback === 'down')}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title={t('Mala respuesta')}
                aria-label={t('Mala respuesta')}
                aria-pressed={feedback === 'down'}
            >
                <ThumbsDown size={18} strokeWidth={2} fill={feedback === 'down' ? 'currentColor' : 'none'} />
            </button>
            {showRegenerate && (
                <button
                    onClick={onRegenerate}
                    style={actionBtnStyle()}
                    onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                    title={t('Regenerar respuesta')}
                    aria-label={t('Regenerar respuesta')}
                >
                    <RefreshCw size={18} strokeWidth={2} />
                </button>
            )}
            <button 
                onClick={handleCopy} 
                style={actionBtnStyle(copied)}
                onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
                title={t('Copiar')}
                aria-label={t('Copiar')}
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
const ErrorRetryButton = ({ onClick }) => {
    const t = useT();
    return (
    <button
        type="button"
        onClick={onClick}
        aria-label={t('Reintentar el último mensaje')}
        style={{
            marginTop: '0.75rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'var(--bg-card)',
            border: '1px solid #fca5a5',
            color: 'var(--danger-text)',
            padding: '0.45rem 0.9rem',
            minHeight: 44,
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
        {t('Reintentar')}
    </button>
    );
};

export const MemoizedMessageBubble = React.memo(({ msg, index, currentSessionId, onRegenerate, onErrorRetry }) => {
    const t = useT();
    const [viewerIndex, setViewerIndex] = useState(null);
    const [brokenImages, setBrokenImages] = useState(() => new Set());
    const viewerCloseRef = useRef(null);
    const viewerTriggerRef = useRef(null);
    const viewerSwipeRef = useRef(null);
    const media = Array.isArray(msg.attachments) && msg.attachments.length
        ? msg.attachments
        : (msg.isImage && msg.imageUrl ? [{ id: 'legacy', url: msg.imageUrl }] : []);
    const viewerUrl = viewerIndex === null
        ? null
        : (media[viewerIndex]?.url || media[viewerIndex]?.image_url || null);
    const viewerOpen = viewerIndex !== null && Boolean(viewerUrl);
    const moveViewer = (direction) => {
        if (media.length < 2) return;
        setViewerIndex((current) => (Number(current) + direction + media.length) % media.length);
    };
    useEffect(() => {
        if (!viewerOpen) return undefined;
        viewerCloseRef.current?.focus();
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setViewerIndex(null);
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setViewerIndex((current) => (Number(current) - 1 + media.length) % media.length);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                setViewerIndex((current) => (Number(current) + 1) % media.length);
            } else if (event.key === 'Tab') {
                const buttons = Array.from(document.querySelectorAll('.message-image-viewer button'));
                if (!buttons.length) return;
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            viewerTriggerRef.current?.focus?.();
        };
    }, [viewerOpen, media.length]);
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
                <BotAvatar size={34} style={{ marginTop: '11px', flexShrink: 0 }} />
            )}

            {/* Mensaje */}
            <div
                {...(isErrorBubble ? { role: 'alert' } : {})}
                {...(msg.role === 'model' && msg.isStreaming ? { 'aria-busy': true } : {})}
                className={msg.role === 'user' ? 'msg-bubble-user' : 'msg-bubble-bot'}
                style={{
                    flex: msg.role === 'user' ? '0 1 auto' : 1,
                    maxWidth: msg.role === 'user' ? '80%' : '100%',
                    minWidth: 0,
                    width: msg.role === 'user' ? 'fit-content' : 'auto',
                    color: msg.role === 'user' ? 'var(--text-main)' : (isErrorBubble ? 'var(--danger-text)' : 'var(--text-main)'),
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                    background: msg.role === 'user' ? 'var(--bg-muted)' : (isErrorBubble ? 'var(--danger-bg)' : 'var(--bg-card)'),
                    padding: msg.role === 'user' ? '0.85rem 1.4rem' : (isErrorBubble ? '0.9rem 1.1rem' : '1rem 0'),
                    borderRadius: msg.role === 'user' ? '1.5rem 1.5rem 0.25rem 1.5rem' : (isErrorBubble ? '0.85rem' : '0'),
                    border: msg.role === 'user' ? '1px solid var(--border)' : (isErrorBubble ? '1px solid #fecaca' : 'none'),
                    boxShadow: 'none'
                }}
            >
                {media.length > 0 && (
                    <div
                        className={`message-media-grid message-media-grid-${Math.min(media.length, 4)}`}
                        style={{ marginBottom: msg.content ? '0.5rem' : 0 }}
                    >
                        {media.map((attachment, mediaIndex) => {
                            const key = attachment.id || attachment.attachment_id || `${attachment.url}-${mediaIndex}`;
                            if (brokenImages.has(key)) {
                                return <div className="message-media-broken" key={key}>{t('Imagen no disponible')}</div>;
                            }
                            return (
                                <button
                                    type="button"
                                    className="message-media-button"
                                    key={key}
                                    aria-label={t('Abrir imagen {number}', { number: mediaIndex + 1 })}
                                    onClick={(event) => {
                                        viewerTriggerRef.current = event.currentTarget;
                                        setViewerIndex(mediaIndex);
                                    }}
                                >
                                    <img
                                        src={attachment.url || attachment.image_url}
                                        alt={t('Imagen enviada {number}', { number: mediaIndex + 1 })}
                                        loading="lazy"
                                        decoding="async"
                                        onError={() => setBrokenImages((prev) => new Set(prev).add(key))}
                                    />
                                </button>
                            );
                        })}
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
                    <ErrorRetryButton onClick={() => onErrorRetry(msg)} />
                )}

                {/* Action bar for model messages — oculto en errores */}
                {msg.role === 'model' && !msg.isStreaming && !isErrorBubble && (
                    <MessageActions
                        content={msg.content}
                        sessionId={currentSessionId}
                        onRegenerate={() => onRegenerate(index)}
                        showRegenerate={!msg.isWelcome}
                    />
                )}
            </div>
            {viewerUrl && typeof document !== 'undefined' && createPortal(
                <div
                    className="message-image-viewer"
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('Vista ampliada de imagen')}
                    onClick={() => setViewerIndex(null)}
                    onTouchStart={(event) => {
                        if (event.touches.length === 1) viewerSwipeRef.current = event.touches[0].clientX;
                    }}
                    onTouchEnd={(event) => {
                        if (viewerSwipeRef.current === null || event.changedTouches.length !== 1) return;
                        const delta = event.changedTouches[0].clientX - viewerSwipeRef.current;
                        viewerSwipeRef.current = null;
                        if (Math.abs(delta) >= 55) moveViewer(delta > 0 ? -1 : 1);
                    }}
                >
                    <button ref={viewerCloseRef} type="button" className="message-image-viewer-close" aria-label={t('Cerrar imagen')} onClick={() => setViewerIndex(null)}>
                        ×
                    </button>
                    <img src={viewerUrl} alt={t('Imagen ampliada')} onClick={(event) => event.stopPropagation()} />
                    {media.length > 1 && (
                        <>
                            <button type="button" className="message-image-viewer-nav previous" aria-label={t('Imagen anterior')} onClick={(event) => { event.stopPropagation(); moveViewer(-1); }}><ChevronLeft size={28} /></button>
                            <button type="button" className="message-image-viewer-nav next" aria-label={t('Imagen siguiente')} onClick={(event) => { event.stopPropagation(); moveViewer(1); }}><ChevronRight size={28} /></button>
                            <span className="message-image-viewer-count" aria-live="polite">{viewerIndex + 1} / {media.length}</span>
                        </>
                    )}
                </div>,
                document.body,
            )}
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
        prevProps.msg.attachments === nextProps.msg.attachments &&
        prevProps.msg.isImage === nextProps.msg.isImage &&
        prevProps.currentSessionId === nextProps.currentSessionId
    );
});
