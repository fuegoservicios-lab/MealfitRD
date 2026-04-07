import React from 'react';
import { Plus, Loader2, Ghost, Trash2 } from 'lucide-react';

export const SidebarRecientes = ({
    showSidebar,
    setShowSidebar,
    handleNewChat,
    isLoadingSessions,
    chatSessions,
    groupedSessions,
    currentSessionId,
    setCurrentSessionId,
    handleDeleteChat,
    isLoading
}) => {
    return (
        <div className="agent-sidebar" style={{
            width: showSidebar ? '320px' : '0px',
            maxWidth: showSidebar ? '85vw' : '0px',
            borderRight: showSidebar ? '1px solid rgba(226, 232, 240, 0.6)' : 'none',
            background: '#f8f9fb',
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0
        }}>
            <div className="sidebar-header-padding" style={{ padding: '1.25rem 1rem', display: 'flex', gap: '0.5rem' }}>
                <button
                    onClick={handleNewChat}
                    style={{
                        width: '100%',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '1.5rem',
                        padding: '0.8rem 1.2rem',
                        color: '#4F46E5',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontSize: '1rem',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = '#ffffff';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                >
                    <Plus size={18} /> <span>Nuevo chat</span>
                </button>
            </div>
            
            <div className="sidebar-scrollable" style={{ flex: 1, overflowY: 'auto', padding: '0 0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', marginTop: '0.25rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                        Recientes
                    </h3>
                </div>
                {isLoadingSessions ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
                        <Loader2 className="spin-fast" size={18} />
                    </div>
                ) : chatSessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: '#94a3b8' }}>
                        <div style={{ background: 'transparent', padding: '0.5rem', display: 'inline-flex', opacity: 0.7 }}>
                            <Ghost size={32} strokeWidth={1.5} />
                        </div>
                        <span style={{ fontSize: '0.9rem', lineHeight: 1.5, maxWidth: '85%' }}>
                            Aún no tienes historiales.<br/>
                            ¡Inicia una nueva conversación!
                        </span>
                    </div>
                ) : (
                    groupedSessions.map(group => (
                        <div key={group.id}>
                            {group.label && (
                                <div style={{ 
                                    padding: '0.5rem 1rem 0.25rem', 
                                    fontSize: '0.7rem', 
                                    fontWeight: 600, 
                                    color: '#94a3b8', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.06em',
                                    marginTop: '0.5rem'
                                }}>
                                    {group.label}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {group.items.map(s => {
                                    let originalTitle = s.title ? s.title.replace(/\[?\(Hora actual del usuario:[^)]*\)\]?/gi, '').replace(/Mensaje del usuario:\s*/gi, '').trim() || 'Nuevo chat' : 'Nuevo chat';
                                    if (originalTitle.length > 45) {
                                        originalTitle = originalTitle.substring(0, 45).trim() + '...';
                                    }
                                    
                                    const dateStr = s.last_activity || s.created_at;
                                    const dateObj = dateStr ? new Date(dateStr) : null;
                                    const formattedDate = dateObj && !isNaN(dateObj) 
                                        ? dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
                                        : '';

                                    return (
                                    <div key={s.id} className="chat-session-btn" style={{ position: 'relative', width: '100%' }}>
                                        <button
                                            onClick={() => {
                                                setCurrentSessionId(s.id);
                                                if (window.innerWidth <= 768) {
                                                    setShowSidebar(false);
                                                }
                                            }}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '0.75rem 3.5rem 0.75rem 1.25rem',
                                                background: currentSessionId === s.id ? '#eef2ff' : 'transparent',
                                                border: 'none',
                                                borderRadius: '0.75rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={e => { if (currentSessionId !== s.id) e.currentTarget.style.background = '#f1f5f9'; }}
                                            onMouseLeave={e => { if (currentSessionId !== s.id) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <span style={{ 
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: ((isLoading && currentSessionId === s.id) || s.title === 'Generando título...') ? '0' : '0.15rem',
                                                flex: 1,
                                                minWidth: 0,
                                                overflow: 'hidden',
                                                justifyContent: 'center',
                                                minHeight: '2.3rem'
                                            }}>
                                                {((isLoading && currentSessionId === s.id) || s.title === 'Generando título...') ? (
                                                    <div style={{ position: 'relative', width: '100%', height: '4px', background: currentSessionId === s.id ? 'rgba(79, 70, 229, 0.15)' : 'rgba(148, 163, 184, 0.15)', borderRadius: '2px', overflow: 'hidden' }}>
                                                        <div style={{ position: 'absolute', top: 0, left: 0, width: '60%', height: '100%', background: currentSessionId === s.id ? 'linear-gradient(90deg, transparent, rgba(79, 70, 229, 0.8), transparent)' : 'linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.8), transparent)', animation: (isLoading && currentSessionId === s.id) ? 'cyberSweep 1.5s ease-in-out infinite' : 'none' }} />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span 
                                                            title={originalTitle}
                                                            style={{ 
                                                            fontWeight: currentSessionId === s.id ? 600 : 500, 
                                                            fontSize: '0.95rem', 
                                                            color: currentSessionId === s.id ? '#4F46E5' : '#475569',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            width: '100%',
                                                            display: 'block'
                                                        }}>
                                                            {originalTitle}
                                                        </span>
                                                        {formattedDate && (
                                                            <span style={{ 
                                                                fontSize: '0.70rem', 
                                                                color: currentSessionId === s.id ? 'rgba(79, 70, 229, 0.6)' : '#94a3b8', 
                                                                fontWeight: 400 
                                                            }}>
                                                                {formattedDate}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </span>
                                        </button>
                                        
                                        <button
                                            className="chat-actions-hover"
                                            title="Eliminar chat"
                                            onClick={(e) => handleDeleteChat(s.id, e)}
                                            style={{
                                                position: 'absolute',
                                                right: '0.4rem',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'white',
                                                color: '#ef4444',
                                                border: '1px solid #fee2e2',
                                                borderRadius: '0.4rem',
                                                padding: '0.35rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                        >
                                            <Trash2 size={15} strokeWidth={2} />
                                        </button>

                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
