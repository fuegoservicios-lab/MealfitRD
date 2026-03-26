import { useState, useRef, useEffect, useCallback } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import { Send, Bot, User, Loader2, Sparkles, MessageSquare, History, Plus, ArrowLeft } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import ReactMarkdown from 'react-markdown';

const ChatWidget = () => {
    const { session, planData, formData, userProfile, updateData, saveGeneratedPlan, checkPlanLimit } = useAssessment();
    // Fallback ID si no hay sesión activa aún
    const [localSessionId, setLocalSessionId] = useState(() => {
        const saved = localStorage.getItem('mealfit_guest_session');
        if (saved) return saved;
        const newId = crypto.randomUUID();
        localStorage.setItem('mealfit_guest_session', newId);
        return newId;
    });

    const [guestSessionIds, setGuestSessionIds] = useState(() => {
        const savedList = localStorage.getItem('mealfit_guest_sessions_list');
        if (savedList) {
            const list = JSON.parse(savedList);
            if (!list.includes(localSessionId)) {
                list.unshift(localSessionId);
                localStorage.setItem('mealfit_guest_sessions_list', JSON.stringify(list));
            }
            return list;
        }
        const initialList = [localSessionId];
        localStorage.setItem('mealfit_guest_sessions_list', JSON.stringify(initialList));
        return initialList;
    });
    
    // El ID de sesión actvo puede cambiar si seleccionamos uno del historial
    const [currentSessionId, setCurrentSessionId] = useState(localSessionId);
    
    const [isOpen, setIsOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [chatSessions, setChatSessions] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    
    // Escuchar el logout para limpiar el estado interno
    useEffect(() => {
        if (!session?.user?.id && !userProfile?.id) {
            const currentGuestSession = localStorage.getItem('mealfit_guest_session');
            if (!currentGuestSession) {
                const newId = crypto.randomUUID();
                localStorage.setItem('mealfit_guest_session', newId);
                setLocalSessionId(newId);
                setCurrentSessionId(newId);
                setMessages([{ role: 'model', content: '¡Hola! Soy tu asistente de nutrición IA. ¿En qué te puedo ayudar con tu plan alimenticio de hoy?' }]);
                setChatSessions([]);
            }
        } else if (session?.user?.id || userProfile?.id) {
            const userId = session?.user?.id || userProfile?.id;
            const initUserSession = async () => {
                try {
                    const response = await fetchWithAuth(`/api/chat/sessions/${userId}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.sessions && data.sessions.length > 0) {
                            setCurrentSessionId(data.sessions[0].id);
                        } else {
                            const newId = crypto.randomUUID();
                            setCurrentSessionId(newId);
                        }
                    }
                } catch (e) {
                    console.error("Error setting initial user session:", e);
                }
            };
            initUserSession();
        }
    }, [session?.user?.id, userProfile?.id]);

    const [messages, setMessages] = useState([
        { role: 'model', content: '¡Hola! Soy tu asistente de nutrición IA. ¿En qué te puedo ayudar con tu plan alimenticio de hoy?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingStatus, setStreamingStatus] = useState(null);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (!showHistory) {
            scrollToBottom();
        }
    }, [messages, isOpen, showHistory]);

    // Cargar sesiones al abrir el chat (si está logueado)
    useEffect(() => {
        if (isOpen && userProfile?.id) {
            fetchChatSessions();
        }
    }, [isOpen, userProfile?.id, fetchChatSessions]);

    // Cargar historial de mensajes cuando cambia la sesión
    useEffect(() => {
        if (isOpen) {
            fetchSessionMessages(currentSessionId);
        }
    }, [currentSessionId, isOpen, fetchSessionMessages]);

    const fetchChatSessions = useCallback(async () => {
        try {
            const userId = session?.user?.id || userProfile?.id || localSessionId;
            if (!userId) return;
            
            const isGuest = !session?.user?.id && !userProfile?.id;
            let url = `/api/chat/sessions/${userId}`;
            
            if (isGuest) {
                const savedListStr = localStorage.getItem('mealfit_guest_sessions_list');
                const latestSessionIds = savedListStr ? JSON.parse(savedListStr) : [currentSessionId];
                const sessionIdsParam = latestSessionIds.join(',');
                url += `?session_ids=${sessionIdsParam}`;
            }
            
            const response = await fetchWithAuth(url);
            if (response.ok) {
                const data = await response.json();
                setChatSessions(data.sessions || []);
            }
        } catch (error) {
            console.error("Error fetching sessions:", error);
        }
    }, [session?.user?.id, userProfile?.id, localSessionId, guestSessionIds, currentSessionId]);

    const fetchSessionMessages = useCallback(async (sessionId) => {
        setIsLoadingHistory(true);
        try {
            const response = await fetchWithAuth(`/api/chat/history/${sessionId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    const filteredMessages = data.messages.filter(m => m.content !== '¡Hola! Soy tu asistente de nutrición IA. ¿En qué te puedo ayudar con tu plan alimenticio de hoy?' && m.content !== '¡Hola! Soy tu asistente de nutrición IA. ¿En nuevo chat, dime qué necesitas?');
                    setMessages(filteredMessages.map(m => {
                        let content = m.content;
                        let isImage = false;
                        let imageUrl = null;
                        
                        // Extract [IMAGE: url]
                        const imgMatch = content.match(/\[IMAGE:\s*(.+?)\]/);
                        if (imgMatch) {
                            isImage = true;
                            imageUrl = imgMatch[1];
                            content = content.replace(/\[IMAGE:\s*.+?\]\n?/, '');
                        }
                        
                        // Limpiar prefijo de visión enriquecido del historial
                        if (m.role === 'user' && content.includes('[El usuario subió una imagen.')) {
                            // Extraer solo el mensaje del usuario real
                            const userMsgMatch = content.match(/Mensaje del usuario:\s*(.+)$/s);
                            if (userMsgMatch) {
                                content = userMsgMatch[1].trim();
                            } else {
                                content = content.replace(/\[El usuario subió una imagen\..+?\]\n\n?/s, '');
                            }
                            if (!content && isImage) content = '';
                        }

                        return {
                            role: m.role,
                            content: content || '',
                            isImage: isImage || (m.role === 'user' && content.includes('[El usuario subió una imagen.')),
                            imageUrl: imageUrl
                        };
                    }));
                } else {
                    // Chat nuevo vacío, poner el de bienvenida
                    setMessages([{ role: 'model', content: '¡Hola! Soy tu asistente de nutrición IA. ¿En qué te puedo ayudar con tu plan alimenticio de hoy?' }]);
                }
            }
        } catch (error) {
            console.error("Error fetching messages:", error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    const handleNewChat = () => {
        setCurrentSessionId(crypto.randomUUID());
        setShowHistory(false);
        setMessages([{ role: 'model', content: '¡Hola! Soy tu asistente de nutrición IA. ¿En nuevo chat, dime qué necesitas?' }]);
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        // Asegurar que el currentSessionId esté en la lista de localStorage
        const savedListStr = localStorage.getItem('mealfit_guest_sessions_list');
        const currentList = savedListStr ? JSON.parse(savedListStr) : [];
        if (!currentList.includes(currentSessionId)) {
            currentList.unshift(currentSessionId);
            localStorage.setItem('mealfit_guest_sessions_list', JSON.stringify(currentList));
            setGuestSessionIds(currentList);
        }

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const actualUserId = session?.user?.id || userProfile?.id || localSessionId;
            console.log("🚀 Enviando a Chat API Stream -> session_id:", currentSessionId, "user_id:", actualUserId);
            setStreamingStatus('Conectando...');

            const response = await fetchWithAuth('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    user_id: actualUserId,
                    prompt: userMsg,
                    current_plan: planData,
                    form_data: formData
                })
            });

            if (response.ok) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let fullText = "";
                let isMessageCreated = false;
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (line.trim().startsWith('data: ')) {
                            try {
                                const dataObj = JSON.parse(line.trim().substring(6));
                                if (dataObj.type === 'progress') {
                                    setStreamingStatus(dataObj.message);
                                } else if (dataObj.type === 'chunk') {
                                    fullText += dataObj.text;
                                    if (!isMessageCreated) {
                                        isMessageCreated = true;
                                        setIsLoading(false);
                                        setStreamingStatus(null);
                                        setMessages(prev => [...prev, { role: 'model', content: fullText, isStreaming: true }]);
                                    } else {
                                        setMessages(prev => {
                                            const updated = [...prev];
                                            if (updated.length > 0 && updated[updated.length - 1].isStreaming) {
                                                updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullText };
                                            }
                                            return updated;
                                        });
                                    }
                                } else if (dataObj.type === 'done') {
                                    setIsLoading(false);
                                    setStreamingStatus(null);
                                    fullText = dataObj.response;
                                    
                                    if (!isMessageCreated) {
                                        isMessageCreated = true;
                                        setMessages(prev => [...prev, { role: 'model', content: fullText }]);
                                    } else {
                                        setMessages(prev => {
                                            const updated = [...prev];
                                            if (updated.length > 0 && updated[updated.length - 1].isStreaming) {
                                                updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullText, isStreaming: false };
                                            }
                                            return updated;
                                        });
                                    }

                                    fetchChatSessions();
                                    
                                    if (dataObj.updated_fields && Object.keys(dataObj.updated_fields).length > 0) {
                                        Object.entries(dataObj.updated_fields).forEach(([field, val]) => {
                                            if (updateData) updateData(field, val);
                                        });
                                    }
                                    if (dataObj.new_plan) {
                                        saveGeneratedPlan(dataObj.new_plan);
                                    }
                                    
                                    setTimeout(async () => {
                                        await checkPlanLimit(actualUserId);
                                    }, 1000);
                                    
                                } else if (dataObj.type === 'error') {
                                    setIsLoading(false);
                                    setStreamingStatus(null);
                                    setMessages(prev => [...prev, { role: 'model', content: `❌ Error de agente: ${dataObj.message}` }]);
                                }
                            } catch (e) {
                                // Ignorar fallos de parseo
                            }
                        }
                    }
                }
            } else {
                let errData = {};
                try { errData = await response.json(); } catch(e){}
                setMessages(prev => [...prev, { role: 'model', content: `❌ Error al comunicarse con la IA: ${errData.detail || ''}` }]);
            }
        } catch (error) {
            console.error("Chat Error:", error);
            setMessages(prev => [...prev, { role: 'model', content: '❌ Error de conexión al servidor.' }]);
        } finally {
            setIsLoading(false);
            setStreamingStatus(null);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
        }}>
            {/* Ventana de Chat */}
            <div style={{
                width: '380px',
                height: '500px',
                background: 'white',
                borderRadius: '1.5rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                display: isOpen ? 'flex' : 'none',
                flexDirection: 'column',
                overflow: 'hidden',
                marginBottom: '1rem',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transformOrigin: 'bottom right',
            }}>
                {/* Chat Header (Estilo Gemini) */}
                <div style={{
                    padding: '1rem 1.25rem',
                    background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #334155'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {showHistory ? (
                            <button 
                                onClick={() => setShowHistory(false)}
                                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '4px' }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                onMouseOut={e => e.currentTarget.style.background = 'none'}
                            >
                                <ArrowLeft size={20} />
                            </button>
                        ) : (
                            <div style={{
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
                                padding: '0.5rem',
                                borderRadius: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Sparkles size={20} color="white" />
                            </div>
                        )}
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {showHistory ? 'Historial de Chats' : 'Mealfit AI'}
                            </h3>
                            {!showHistory && (
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8', fontWeight: 500 }}>
                                    Asistente Nutricional Inteligente
                                </p>
                            )}
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!showHistory && userProfile?.id && (
                            <button 
                                onClick={() => { setShowHistory(true); fetchChatSessions(); }}
                                title="Ver Historial"
                                style={{
                                    background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex'
                                }}
                            >
                                <History size={18} />
                            </button>
                        )}
                        <button 
                            onClick={handleNewChat}
                            title="Nuevo Chat"
                            style={{
                                background: '#3B82F6', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex'
                            }}
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                {/* Área Principal (Historial o Chat) */}
                {showHistory ? (
                    <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {chatSessions.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#64748B', marginTop: '2rem', fontSize: '0.9rem' }}>
                                No tienes chats anteriores.
                            </div>
                        ) : (
                            chatSessions.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        setCurrentSessionId(s.id);
                                        setShowHistory(false);
                                    }}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '1rem',
                                        background: currentSessionId === s.id ? '#E0E7FF' : 'white',
                                        border: currentSessionId === s.id ? '1px solid #818CF8' : '1px solid #E2E8F0',
                                        borderRadius: '0.75rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.25rem'
                                    }}
                                    onMouseOver={e => { if (currentSessionId !== s.id) e.currentTarget.style.borderColor = '#94A3B8'; }}
                                    onMouseOut={e => { if (currentSessionId !== s.id) e.currentTarget.style.borderColor = '#E2E8F0'; }}
                                >
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1E293B' }}>
                                        {s.title ? s.title.replace(/\[?\(Hora actual del usuario:.*?\)?\]?/gi, '').replace(/Mensaje del usuario:\s*/gi, '').trim() || 'Nuevo chat' : 'Nuevo chat'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                        {new Date(s.created_at).toLocaleDateString()} {new Date(s.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                ) : (
                    <>
                        {/* Mensajes */}
                        <div style={{
                            flex: 1,
                            padding: '1.25rem',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.25rem',
                            background: '#F8FAFC'
                        }}>
                            {isLoadingHistory ? (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94A3B8', gap: '0.5rem' }}>
                                    <Loader2 className="spin-fast" size={20} /> Cargando mensajes...
                                </div>
                            ) : (
                                messages.map((msg, i) => (
                                    <div key={i} style={{
                                        display: 'flex',
                                        gap: '0.75rem',
                                        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                        alignItems: 'flex-end'
                                    }}>
                                        {/* Avatar */}
                                        {msg.role === 'model' && (
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'white', flexShrink: 0
                                            }}>
                                                <Sparkles size={16} />
                                            </div>
                                        )}

                                        {/* Bubble */}
                                        <div style={{
                                            maxWidth: '75%',
                                            padding: '0.85rem 1rem',
                                            borderRadius: msg.role === 'user'
                                                ? '1rem 1rem 0 1rem'
                                                : '1rem 1rem 1rem 0',
                                            background: msg.role === 'user' ? '#3B82F6' : 'white',
                                            color: msg.role === 'user' ? 'white' : '#1E293B',
                                            border: msg.role === 'model' ? '1px solid #E2E8F0' : 'none',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                            fontSize: '0.95rem',
                                            lineHeight: 1.5,
                                            whiteSpace: 'pre-wrap'
                                        }}>
                                            {msg.isImage && msg.imageUrl && (
                                                <div style={{ marginBottom: msg.content ? '0.5rem' : 0 }}>
                                                    <img 
                                                        src={msg.imageUrl} 
                                                        alt="Imagen enviada" 
                                                        style={{ 
                                                            maxWidth: '220px', 
                                                            width: '100%',
                                                            borderRadius: '0.5rem', 
                                                            maxHeight: '220px', 
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
                                        </div>
                                    </div>
                                ))
                            )}
                            {isLoading && (
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0' }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', flexShrink: 0
                                    }}>
                                        <Sparkles size={16} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#64748B', fontSize: '0.9rem' }}>
                                        <Loader2 className="spin-fast" size={16} color="#8B5CF6" />
                                        <span style={{
                                            background: 'linear-gradient(90deg, #64748B 0%, #94A3B8 50%, #64748B 100%)',
                                            backgroundSize: '200% auto',
                                            color: 'transparent',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            animation: 'shimmer 2s linear infinite'
                                        }}>{streamingStatus || 'Pensando...'}</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div style={{
                            padding: '1rem',
                            background: 'white',
                            borderTop: '1px solid #E2E8F0',
                        }}>
                            <div style={{
                                display: 'flex',
                                background: '#F1F5F9',
                                borderRadius: '1.5rem',
                                padding: '0.25rem',
                                border: '1px solid #E2E8F0',
                            }}>
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Pregúntale a tu asistente..."
                                    disabled={isLoading}
                                    style={{
                                        flex: 1,
                                        background: 'transparent',
                                        border: 'none',
                                        padding: '0.75rem 1rem',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        color: '#1E293B'
                                    }}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    style={{
                                        background: input.trim() && !isLoading ? '#3B82F6' : '#CBD5E1',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: 44,
                                        height: 44,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: input.trim() && !isLoading ? 'pointer' : 'default',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                            <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.7rem', color: '#94A3B8' }}>
                                La IA puede cometer errores. Considera verificar la información.
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Fab Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '3.5rem',
                    height: '3.5rem',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                    color: 'white',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.4), 0 8px 10px -6px rgba(15, 23, 42, 0.2)',
                    transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: isOpen ? 'rotate(-15deg)' : 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05) ' + (isOpen ? 'rotate(-15deg)' : '')}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) ' + (isOpen ? 'rotate(-15deg)' : '')}
            >
                {isOpen ? <span style={{fontSize: '1.5rem', fontWeight: 600}}>×</span> : <MessageSquare size={24} />}
            </button>

            <style>{`
                .markdown-chat { font-size: 0.95rem; line-height: 1.5; word-break: break-word; }
                .markdown-chat p { margin-top: 0; margin-bottom: 0.75rem; }
                .markdown-chat p:last-child { margin-bottom: 0; }
                .markdown-chat ul, .markdown-chat ol { margin-top: 0; margin-bottom: 0.75rem; padding-left: 1.25rem; }
                .markdown-chat ul:last-child, .markdown-chat ol:last-child { margin-bottom: 0; }
                .markdown-chat li { margin-bottom: 0.25rem; }
                .markdown-chat strong { font-weight: 700; color: inherit; }

                .spin-fast { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default ChatWidget;
