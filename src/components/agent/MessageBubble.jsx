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
import { ThumbsUp, ThumbsDown, RefreshCw, Copy, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ejeDelGesto, decidirGestoVisor, arrastreDelVisor } from '../../utils/imageViewerGesture';
import { fetchWithAuth } from '../../config/api';
import { useT, formatDate } from '../../i18n';
import { timeLabel } from '../../utils/chatTimeline';
import { toast } from 'sonner';
import { triggerMobileHaptic } from '../../utils/mobileHaptics';
import { ChatImage } from './ChatImage';
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

    // [P2-MSG-ACTIONS-COMPACT · 2026-09-03] Los cuatro iconos iban en botones de 44×44 con
    // 0,6rem de hueco: ~54px de paso entre iconos de 18px, un aire enorme en escritorio y
    // la fila lejos del texto. Tamaño y hueco pasan a CSS (MessageBubble.css): 32px con 2px
    // de hueco donde hay puntero fino, 42px donde el puntero es el dedo (`pointer: coarse`).
    const actionBtnClass = (active = false) => `msg-action-btn${active ? ' is-active' : ''}`;

    return (
        <div className="msg-actions">
            <button 
                onClick={() => handleFeedback('up')} 
                className={actionBtnClass(feedback === 'up')}
                title={t('Buena respuesta')}
                aria-label={t('Buena respuesta')}
                aria-pressed={feedback === 'up'}
            >
                <ThumbsUp size={18} strokeWidth={2} fill={feedback === 'up' ? 'currentColor' : 'none'} />
            </button>
            <button 
                onClick={() => handleFeedback('down')} 
                className={actionBtnClass(feedback === 'down')}
                title={t('Mala respuesta')}
                aria-label={t('Mala respuesta')}
                aria-pressed={feedback === 'down'}
            >
                <ThumbsDown size={18} strokeWidth={2} fill={feedback === 'down' ? 'currentColor' : 'none'} />
            </button>
            {showRegenerate && (
                <button
                    onClick={onRegenerate}
                    className={actionBtnClass()}
                    title={t('Regenerar respuesta')}
                    aria-label={t('Regenerar respuesta')}
                >
                    <RefreshCw size={18} strokeWidth={2} />
                </button>
            )}
            <button 
                onClick={handleCopy} 
                className={actionBtnClass(copied)}
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
// [P2-CHAT-FRONT-AUDIT · 2026-09-14] `reload`: el 409 (la respuesta a regenerar ya cambió)
// no se reintenta — el mismo botón recarga la conversación y lo dice.
const ErrorRetryButton = ({ onClick, reload = false }) => {
    const t = useT();
    return (
    <button
        type="button"
        onClick={onClick}
        aria-label={reload ? t('Recargar conversación') : t('Reintentar el último mensaje')}
        // [P2-CHAT-ERROR-MINIMAL · 2026-09-04] Antes: caja roja con borde y botón bordeado de 44 px
        // («muy feo, hazlo más minimalista»). Ahora: una línea discreta y «Reintentar» como enlace.
        style={{
            marginTop: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 999,
            color: 'var(--text-main)',
            padding: '0.3rem 0.75rem',
            minHeight: 30,
            fontSize: '0.8rem',
            fontWeight: 600,
            lineHeight: 1,
            cursor: 'pointer',
            transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
        <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
        {reload ? t('Recargar conversación') : t('Reintentar')}
    </button>
    );
};

export const MemoizedMessageBubble = React.memo(({ msg, index, currentSessionId, onRegenerate, onErrorRetry, daySeparator = null }) => {
    const t = useT();
    const [viewerIndex, setViewerIndex] = useState(null);
    const [brokenImages, setBrokenImages] = useState(() => new Set());
    const viewerCloseRef = useRef(null);
    const viewerTriggerRef = useRef(null);
    const viewerSwipeRef = useRef(null);
    const viewerRootRef = useRef(null);
    const media = Array.isArray(msg.attachments) && msg.attachments.length
        ? msg.attachments
        : (msg.isImage && msg.imageUrl ? [{ id: 'legacy', url: msg.imageUrl }] : []);
    // [P2-PHOTO-BUBBLE-CLEAN · 2026-09-06] Foto SOLA: sin la caja gris alrededor — la miniatura ya tiene su propio
    // radio y su propio recorte. Con texto el chrome se quedaba… alrededor de los DOS.
    //
    // [P1-PLAN-LOTE-169 · 2026-09-23] …y eso era lo raro. El dueño, con la foto del desayuno + «y me comí 3 tacos…»: la
    // burbuja gris toma el ancho del TEXTO y la foto (320 px) deja al lado un hueco gris. Además, en el teléfono el
    // chrome va por la CLASE `.msg-bubble-user` (con !important, AgentPage.jsx), así que la foto sola también salía
    // enmarcada allí aunque el estilo en línea dijera «transparente». Ahora la foto del usuario va SIEMPRE fuera de la
    // burbuja, alineada a la derecha, y el texto —si lo hay— lleva su propia burbuja, del ancho del texto: la forma de
    // WhatsApp o iMessage. El contenedor (`msg-user-grupo`) no tiene chrome ni la clase de la burbuja.
    const fotoAparte = msg.role === 'user' && media.length > 0;
    const _textoConFoto = fotoAparte && Boolean(String(msg.content || '').trim()) && msg.content !== '📷 Imagen enviada';
    // [P1-PLAN-LOTE-117] El visor abre la versión COMPLETA. Recién enviada, la burbuja pinta la miniatura local de
    // 360 px (`thumbDataUrl`): ampliada a pantalla entera se veía borrosa («que se vea nítida»). `fullUrl` apunta a la
    // vista previa a resolución de subida hasta que el servidor devuelve su URL.
    const viewerUrl = viewerIndex === null
        ? null
        : (media[viewerIndex]?.fullUrl || media[viewerIndex]?.url || media[viewerIndex]?.image_url || null);
    const viewerOpen = viewerIndex !== null && Boolean(viewerUrl);
    const moveViewer = (direction) => {
        if (media.length < 2) return;
        setViewerIndex((current) => (Number(current) + direction + media.length) % media.length);
    };
    // [P1-PLAN-LOTE-122] Los gestos del visor (utils/imageViewerGesture.js): horizontal pasa de foto, hacia ABAJO
    // cierra con la foto siguiendo al dedo. El arrastre se pinta con variables CSS sobre el propio visor: sin
    // re-renderizar la burbuja en cada fotograma.
    const pintarArrastre = (dy) => {
        const el = viewerRootRef.current;
        if (!el) return;
        if (dy === null) {
            el.classList.remove('arrastrando');
            el.style.removeProperty('--visor-baja');
            el.style.removeProperty('--visor-opacidad');
            return;
        }
        const { baja, opacidad } = arrastreDelVisor(dy);
        el.classList.add('arrastrando');
        el.style.setProperty('--visor-baja', `${baja}px`);
        el.style.setProperty('--visor-opacidad', String(opacidad));
    };
    const ahora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const onViewerTouchStart = (event) => {
        if (event.touches.length !== 1) { viewerSwipeRef.current = null; pintarArrastre(null); return; }
        const tt = event.touches[0];
        viewerSwipeRef.current = { x0: tt.clientX, y0: tt.clientY, y: tt.clientY, t: ahora(), vy: 0, eje: null };
    };
    const onViewerTouchMove = (event) => {
        const g = viewerSwipeRef.current;
        if (!g) return;
        if (event.touches.length !== 1) { viewerSwipeRef.current = null; pintarArrastre(null); return; }
        const tt = event.touches[0];
        const dx = tt.clientX - g.x0;
        const dy = tt.clientY - g.y0;
        if (g.eje === null) g.eje = ejeDelGesto({ dx, dy });
        const instante = ahora();
        g.vy = (tt.clientY - g.y) / Math.max(8, instante - g.t);
        g.y = tt.clientY;
        g.t = instante;
        const zoom = (typeof window !== 'undefined' && window.visualViewport?.scale) || 1;
        if (g.eje === 'vertical' && zoom <= 1.01) pintarArrastre(dy);
    };
    const onViewerTouchEnd = (event) => {
        const g = viewerSwipeRef.current;
        viewerSwipeRef.current = null;
        if (!g || event.changedTouches.length !== 1) { pintarArrastre(null); return; }
        const tt = event.changedTouches[0];
        const zoom = (typeof window !== 'undefined' && window.visualViewport?.scale) || 1;
        const accion = decidirGestoVisor({
            eje: g.eje, dx: tt.clientX - g.x0, dy: tt.clientY - g.y0, vy: g.vy, zoom, varias: media.length > 1,
        });
        pintarArrastre(null);
        if (accion === 'cerrar') setViewerIndex(null);
        else if (accion === 'anterior') moveViewer(-1);
        else if (accion === 'siguiente') moveViewer(1);
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
    // [P2-CHAT-TIMELINE · 2026-09-03] Si el día cambió respecto al mensaje anterior, un
    // separador encima de la fila. La hora NO se pinta: el dueño la vio innecesaria en el
    // hilo; queda solo como tooltip de la burbuja (escritorio) para quien la busque.
    const _hora = timeLabel(msg, formatDate);
    return (
        <>
        {daySeparator && (
            <div className="msg-day-sep" role="separator" aria-label={daySeparator}>
                <span>{daySeparator}</span>
            </div>
        )}
        <div className={msg.isWelcome ? 'message-row-welcome' : undefined} data-client-message-id={msg.clientMessageId || undefined} style={{
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
                className={fotoAparte ? 'msg-user-grupo' : (msg.role === 'user' ? 'msg-bubble-user' : 'msg-bubble-bot')}
                title={_hora || undefined}
                style={fotoAparte ? {
                    // [P1-PLAN-LOTE-169] columna sin chrome: la foto arriba, la burbuja del texto debajo, las dos a la derecha
                    flex: '0 1 auto',
                    maxWidth: '80%',
                    minWidth: 0,
                    width: 'fit-content',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '0.4rem',
                    color: 'var(--text-main)',
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                } : {
                    flex: msg.role === 'user' ? '0 1 auto' : 1,
                    maxWidth: msg.role === 'user' ? '80%' : '100%',
                    minWidth: 0,
                    width: msg.role === 'user' ? 'fit-content' : 'auto',
                    color: msg.role === 'user' ? 'var(--text-main)' : (isErrorBubble ? 'var(--text-muted)' : 'var(--text-main)'),
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                    // [P2-CHAT-ERROR-MINIMAL] el error ya no es una caja roja: texto apagado con un icono, sin fondo ni borde
                    background: msg.role === 'user' ? 'var(--bg-muted)' : 'var(--bg-card)',
                    padding: msg.role === 'user' ? '0.85rem 1.4rem' : (isErrorBubble ? '0.6rem 0' : '1rem 0'),
                    borderRadius: msg.role === 'user' ? '1.5rem 1.5rem 0.25rem 1.5rem' : '0',
                    border: msg.role === 'user' ? '1px solid var(--border)' : 'none',
                    boxShadow: 'none'
                }}
            >
                {media.length > 0 && (
                    <div
                        className={`message-media-grid message-media-grid-${Math.min(media.length, 4)}`}
                        style={{ marginBottom: (!fotoAparte && msg.content) ? '0.5rem' : 0 }}
                    >
                        {media.map((attachment, mediaIndex) => {
                            // [P1-PLAN-LOTE-123] `clientKey` primero: no cambia cuando la foto local pasa a ser la del servidor
                            const key = attachment.clientKey || attachment.id || attachment.attachment_id || `${attachment.url}-${mediaIndex}`;
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
                                    <ChatImage
                                        url={attachment.url || attachment.image_url}
                                        alt={t('Imagen enviada {number}', { number: mediaIndex + 1 })}
                                        loading="lazy"
                                        decoding="async"
                                        onBroken={() => setBrokenImages((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))}
                                    />
                                </button>
                            );
                        })}
                    </div>
                )}
                {/* [P2-CHAT-ERROR-MINIMAL v2] el error es UNA línea: icono · texto · Reintentar (el markdown
                    partía el texto en un párrafo propio y el botón caía a una tercera línea). */}
                {isErrorBubble && (
                    <div className="chat-error-line" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem 0.9rem', fontSize: '0.9rem', minHeight: 32 }}>
                        <span>{msg.content}</span>
                        {msg.retryable && typeof onErrorRetry === 'function' && (
                            <ErrorRetryButton onClick={() => onErrorRetry(msg)} reload={msg.reloadHistory === true} />
                        )}
                    </div>
                )}
                {/* [P1-PLAN-LOTE-169] con foto, el texto va en SU burbuja (del ancho del texto), fuera de la foto */}
                {_textoConFoto && (
                    <div
                        className="msg-bubble-user"
                        style={{
                            maxWidth: '100%',
                            minWidth: 0,
                            width: 'fit-content',
                            color: 'var(--text-main)',
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word',
                            background: 'var(--bg-muted)',
                            padding: '0.85rem 1.4rem',
                            borderRadius: '1.5rem 1.5rem 0.25rem 1.5rem',
                            border: '1px solid var(--border)',
                            boxShadow: 'none',
                        }}
                    >
                        <div className="markdown-chat">
                            <LazyMarkdown>{msg.content}</LazyMarkdown>
                        </div>
                    </div>
                )}
                {!fotoAparte && !isErrorBubble && msg.content && msg.content !== '📷 Imagen enviada' && (
                    <div className="markdown-chat">
                        <LazyMarkdown>{msg.content}</LazyMarkdown>
                    </div>
                )}
                {/* [P2-CHAT-FRONT-AUDIT · 2026-09-14] La respuesta se cortó antes de terminar
                    (stream cerrado sin `done`, error o red): lo recibido se conserva, pero dicho. */}
                {msg.role === 'model' && msg._incomplete === true && !msg.isStreaming && !isErrorBubble && (
                    <div className="msg-incomplete-note" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                        {t('Respuesta incompleta')}
                    </div>
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
                    ref={viewerRootRef}
                    className={`message-image-viewer${media.length > 1 ? ' con-varias' : ''}`}
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('Vista ampliada de imagen')}
                    onClick={() => setViewerIndex(null)}
                    onTouchStart={onViewerTouchStart}
                    onTouchMove={onViewerTouchMove}
                    onTouchEnd={onViewerTouchEnd}
                    onTouchCancel={onViewerTouchEnd}
                >
                    <button ref={viewerCloseRef} type="button" className="message-image-viewer-close" aria-label={t('Cerrar imagen')} onClick={() => setViewerIndex(null)}>
                        <X size={22} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                    <ChatImage url={viewerUrl} alt={t('Imagen ampliada')} onClick={(event) => event.stopPropagation()} />
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
    </>
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
        prevProps.daySeparator === nextProps.daySeparator &&
        prevProps.msg.created_at === nextProps.msg.created_at &&
        prevProps.currentSessionId === nextProps.currentSessionId
    );
});
