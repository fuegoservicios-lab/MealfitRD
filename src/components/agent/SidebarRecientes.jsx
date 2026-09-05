import React from 'react';
import { Plus, Loader2, Ghost, Trash2 } from 'lucide-react';
import { formatDate, useT } from '../../i18n';

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
    isLoading,
    isMobile,
    sidebarRef,
    // [P2-CHAT-SESSIONS-PAGING · 2026-09-03]
    hasMoreSessions = false,
    isLoadingMoreSessions = false,
    onLoadMoreSessions = null,
}) => {
    const t = useT();
    return (
        <div
            ref={sidebarRef}
            id="agent-history-drawer"
            className="agent-sidebar"
            role={isMobile && showSidebar ? 'dialog' : undefined}
            aria-modal={isMobile && showSidebar ? 'true' : undefined}
            aria-label={isMobile && showSidebar ? t('Historial de chats') : undefined}
            aria-hidden={!showSidebar}
            inert={!showSidebar ? '' : undefined}
            style={{
            width: showSidebar ? '320px' : '0px',
            maxWidth: showSidebar ? '85vw' : '0px',
            borderRight: showSidebar ? '1px solid var(--border)' : 'none',
            background: 'var(--bg-page)',
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0
            }}
        >
            {/* [P3-SIDEBAR-LOADBAR-FULL · 2026-06-19] Keyframe del shimmer de la barra de carga (full-width). */}
            <style>{'@keyframes sbLoadShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}'}</style>
            <div className="sidebar-header-padding" style={{ padding: '1.25rem 1rem', display: 'flex', gap: '0.5rem' }}>
                <button
                    onClick={handleNewChat}
                    style={{
                        // [SIDEBAR-NEWCHAT-CONTRAST · 2026-06-01] var(--primary) (en vez de
                        // #4F46E5 hardcodeado) → texto/ícono nítidos en oscuro (indigo-400);
                        // tinte indigo sutil (color-mix) define el botón como CTA.
                        width: '100%',
                        background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--primary) 32%, transparent)',
                        borderRadius: '1.5rem',
                        padding: '0.8rem 1.2rem',
                        height: '2.75rem',  // [P2-CHAT-SCROLLBAR-TWINS] alto fijo: el hilo del chat se alinea a él
                        color: 'var(--primary)',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontSize: '1rem',
                        boxShadow: 'none'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 20%, transparent)';
                        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 45%, transparent)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 12%, transparent)';
                        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 32%, transparent)';
                    }}
                >
                    <Plus size={18} /> <span>{t('Nuevo chat')}</span>
                </button>
            </div>
            
            <div className="sidebar-scrollable" style={{ flex: 1, overflowY: 'auto', padding: '0 0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', marginTop: '0.25rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                        {t('Recientes')}
                    </h3>
                </div>
                {isLoadingSessions ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 1rem', color: 'var(--text-light)' }}>
                        <Loader2 className="spin-fast" size={18} />
                    </div>
                ) : chatSessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.75rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        {/* [P3-AGENT-EMPTY-POLISH · 2026-06-19] Orbe con glow de marca + float
                            sutil + copy más clara (antes: ícono plano + texto algo seco). */}
                        <style>{'@keyframes ghostFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}'}</style>
                        <div style={{
                            width: 68, height: 68, borderRadius: '50%',
                            display: 'grid', placeItems: 'center',
                            background: 'radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--primary) 20%, transparent), transparent 72%)',
                            border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)',
                            color: 'color-mix(in srgb, var(--primary) 78%, var(--text-light))',
                            animation: 'ghostFloat 3.2s ease-in-out infinite'
                        }}>
                            <Ghost size={30} strokeWidth={1.6} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxWidth: '90%' }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                {t('Sin conversaciones aún')}
                            </span>
                            <span style={{ fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-light)' }}>
                                {t('Inicia un chat y aparecerá aquí.')}
                            </span>
                        </div>
                    </div>
                ) : (
                    groupedSessions.map(group => (
                        <div key={group.id}>
                            {group.label && (
                                <div style={{ 
                                    padding: '0.5rem 1rem 0.25rem', 
                                    fontSize: '0.7rem', 
                                    fontWeight: 600,
                                    color: 'var(--text-light)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    marginTop: '0.5rem'
                                }}>
                                    {group.label}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {group.items.map(s => {
                                    // [P1-I18N-CHAT-TITULOS-SERVIDOR · 2026-08-22] Los rótulos
                                    // GENÉRICOS los resuelve el cliente por `title_key`; el
                                    // backend ya no manda su texto. Antes componía «Nuevo Chat»
                                    // e «Interacción con imagen o sistema» en español y aquí se
                                    // pintaban crudos: en la app en inglés la columna listaba
                                    // «Nuevo Chat» bajo un encabezado que decía «Today».
                                    //
                                    // `title` sólo llega con contenido REAL (el `[SYSTEM_TITLE]`,
                                    // que nace ya en el idioma del usuario, o lo que él escribió),
                                    // y eso no se traduce.
                                    const _rotulosGenericos = {
                                        empty: t('Nuevo chat'),
                                        image_or_system: t('Interacción con imagen o sistema'),
                                    };
                                    let originalTitle = s.title
                                        ? (s.title.replace(/\[?\(Hora actual del usuario:[^)]*\)\]?/gi, '').replace(/Mensaje del usuario:\s*/gi, '').trim()
                                            || _rotulosGenericos[s.title_key] || t('Nuevo chat'))
                                        : (_rotulosGenericos[s.title_key] || t('Nuevo chat'));
                                    if (originalTitle.length > 45) {
                                        originalTitle = originalTitle.substring(0, 45).trim() + '...';
                                    }
                                    
                                    const dateStr = s.last_activity || s.created_at;
                                    const dateObj = dateStr ? new Date(dateStr) : null;
                                    const formattedDate = dateObj && !isNaN(dateObj) 
                                        ? formatDate(dateObj, { day: 'numeric', month: 'short' }).replace('.', '')
                                        : '';

                                    return (
                                    <div key={s.id} className="chat-session-btn" style={{ position: 'relative', width: '100%' }}>
                                        <button
                                            onClick={() => {
                                                // [P2-AGENT-SESSION-SWITCH-GUARD · 2026-05-30]
                                                // No cambiar de sesión mientras un stream está
                                                // en vuelo. Pre-fix: el switch no abortaba el
                                                // stream ni guardaba isLoading → el loop de
                                                // handleSend seguía haciendo setMessages sobre la
                                                // sesión B recién seleccionada (la respuesta del
                                                // bot de A se "derramaba" en B) y el effect de
                                                // cache persistía los mensajes de A bajo la key de
                                                // B (corrupción restaurada al re-montar). El botón
                                                // Detener es la salida intencional durante stream.
                                                if (isLoading && currentSessionId !== s.id) return;
                                                setCurrentSessionId(s.id);
                                                if (window.innerWidth <= 768) {
                                                    setShowSidebar(false);
                                                }
                                            }}
                                            aria-current={currentSessionId === s.id ? 'true' : undefined}
                                            style={{
                                                // [SIDEBAR-RECIENTES-DARK · 2026-06-16] Estado
                                                // seleccionado theme-aware (antes #eef2ff/#4F46E5
                                                // hardcodeados → caja blanca + texto bajo contraste
                                                // en oscuro). Mismo patrón que "Nuevo chat":
                                                // color-mix sobre var(--primary).
                                                width: '100%',
                                                textAlign: 'left',
                                                // [P3-SIDEBAR-LOADBAR-FULL · 2026-06-19] Al CARGAR, quitamos el
                                                // padding-right de 3.5rem (reservado para el botón borrar que solo
                                                // aparece en hover) → la barra de carga llega COMPLETA al borde
                                                // (padding simétrico 1.25rem). Sin esto el bar terminaba 3.5rem antes
                                                // y se veía "cortado" aunque fuera width:100%.
                                                padding: ((isLoading && currentSessionId === s.id) || s.title === 'Generando título...')
                                                    ? '0.75rem 1.25rem'
                                                    : '0.75rem 3.5rem 0.75rem 1.25rem',
                                                background: currentSessionId === s.id ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'transparent',
                                                border: currentSessionId === s.id ? '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' : '1px solid transparent',
                                                borderRadius: '0.75rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={e => { if (currentSessionId !== s.id) e.currentTarget.style.background = 'var(--bg-muted)'; }}
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
                                                    /* [P3-SIDEBAR-LOADBAR-FULL · 2026-06-19] Barra de carga FULL-WIDTH con
                                                       shimmer. Antes: un sweep absoluto de 60% que, estático o a media
                                                       animación, se veía "cortado" a la izquierda (raro). Ahora es una barra
                                                       completa con brillo que recorre todo el ancho. */
                                                    <div style={{
                                                        width: '100%',
                                                        height: '4px',
                                                        borderRadius: '2px',
                                                        background: currentSessionId === s.id
                                                            ? 'linear-gradient(90deg, color-mix(in srgb, var(--primary) 14%, transparent) 0%, color-mix(in srgb, var(--primary) 82%, transparent) 50%, color-mix(in srgb, var(--primary) 14%, transparent) 100%)'
                                                            : 'linear-gradient(90deg, rgba(148, 163, 184, 0.12) 0%, rgba(148, 163, 184, 0.7) 50%, rgba(148, 163, 184, 0.12) 100%)',
                                                        backgroundSize: '200% 100%',
                                                        animation: 'sbLoadShimmer 1.4s ease-in-out infinite'
                                                    }} />
                                                ) : (
                                                    <>
                                                        <span
                                                            title={originalTitle}
                                                            style={{
                                                            fontWeight: currentSessionId === s.id ? 600 : 500,
                                                            fontSize: '0.95rem',
                                                            color: currentSessionId === s.id ? 'var(--primary)' : 'var(--text-muted)',
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
                                                                color: currentSessionId === s.id ? 'color-mix(in srgb, var(--primary) 65%, transparent)' : 'var(--text-light)',
                                                                fontWeight: 400
                                                            }}>
                                                                {formattedDate}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </span>
                                        </button>
                                        
                                        {/* [P2-CHAT-DELETE-CONFIRM · 2026-09-03] La papelera era un botón
                                            de 44px con borde rojo en CADA fila y pegado al borde: en el
                                            teléfono, donde siempre está visible (P1-CHAT-DELETE-TOUCH),
                                            pesaba más que el título. Ahora es un icono fantasma con la
                                            MISMA área táctil de 44px; solo se tiñe de peligro al pasar o
                                            pulsar. Y ya no borra: pide confirmación (pasa el título). */}
                                        <button
                                            className="chat-actions-hover chat-delete-btn"
                                            title={t('Eliminar chat')}
                                            aria-label={t('Eliminar chat')}
                                            onClick={(e) => handleDeleteChat(s.id, e, originalTitle)}
                                            style={{
                                                position: 'absolute',
                                                right: '0.45rem',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'transparent',
                                                color: 'var(--text-light)',
                                                border: 'none',
                                                borderRadius: '0.6rem',
                                                width: '44px',
                                                height: '44px',
                                                padding: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                transition: 'color 0.15s ease, background 0.15s ease',
                                            }}
                                        >
                                            <Trash2 size={17} strokeWidth={1.9} />
                                        </button>

                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
                {hasMoreSessions && typeof onLoadMoreSessions === 'function' && (
                    <button
                        type="button"
                        onClick={onLoadMoreSessions}
                        disabled={isLoadingMoreSessions}
                        style={{
                            margin: '0.75rem auto 1rem', padding: '0.55rem 1rem', borderRadius: '999px',
                            border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)',
                            fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                            cursor: isLoadingMoreSessions ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        }}
                    >
                        {isLoadingMoreSessions ? <Loader2 className="spin-fast" size={14} /> : null}
                        {isLoadingMoreSessions ? t('Cargando…') : t('Ver más')}
                    </button>
                )}
            </div>
        </div>
    );
};
