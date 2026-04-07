import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
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

export const MemoizedMessageBubble = React.memo(({ msg, index, currentSessionId, onRegenerate }) => {
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
            <div className={msg.role === 'user' ? 'msg-bubble-user' : 'msg-bubble-bot'} style={{
                flex: msg.role === 'user' ? '0 1 auto' : 1,
                maxWidth: msg.role === 'user' ? '80%' : '100%',
                width: msg.role === 'user' ? 'fit-content' : 'auto',
                color: msg.role === 'user' ? '#0f172a' : '#1e293b',
                fontSize: '0.95rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                background: msg.role === 'user' ? '#f0f4f8' : '#ffffff',
                padding: msg.role === 'user' ? '0.85rem 1.4rem' : '1rem 0',
                borderRadius: msg.role === 'user' ? '1.5rem 1.5rem 0.25rem 1.5rem' : '0',
                border: msg.role === 'user' ? '1px solid #e2e8f0' : 'none',
                boxShadow: 'none'
            }}>
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
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                )}
                
                {/* Action bar for model messages */}
                {msg.role === 'model' && !msg.isStreaming && (
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
        prevProps.currentSessionId === nextProps.currentSessionId
    );
});
