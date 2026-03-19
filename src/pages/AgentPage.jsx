import { useState, useRef, useEffect, useCallback } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import { Send, Bot, Loader2, Paperclip, X, Image as ImageIcon, Plus, MessageSquare, History, Menu, Apple, Dumbbell, Utensils, Camera, Sparkles, Lock } from 'lucide-react';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { fetchWithAuth } from '../config/api';
import ReactMarkdown from 'react-markdown';

const AgentPage = () => {
    const { session, planData, formData, updateData, saveGeneratedPlan, userProfile, isPlus, checkPlanLimit } = useAssessment();
    
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
    
    const [currentSessionId, _setCurrentSessionId] = useState(() => {
        return localStorage.getItem('mealfit_current_session') || localSessionId;
    });
    const setCurrentSessionId = (id) => {
        localStorage.setItem('mealfit_current_session', id);
        _setCurrentSessionId(id);
    };
    
    // Escuchar el logout para limpiar el estado interno
    useEffect(() => {
        if (!session?.user?.id && !userProfile?.id) {
            const currentGuestSession = localStorage.getItem('mealfit_guest_session');
            if (!currentGuestSession) {
                const newId = crypto.randomUUID();
                localStorage.setItem('mealfit_guest_session', newId);
                setLocalSessionId(newId);
                setCurrentSessionId(newId);
                setMessages([]);
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

    const [chatSessions, setChatSessions] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [showSidebar, setShowSidebar] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 768 : true);

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingStatus, setStreamingStatus] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setSelectedFile(file);
            // Convertir a base64 para que persista en el chat después de limpiar
            const reader = new FileReader();
            reader.onloadend = () => setPreviewUrl(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const clearSelectedFile = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    setSelectedFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setPreviewUrl(reader.result);
                    reader.readAsDataURL(file);
                }
                break;
            }
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchChatSessions = useCallback(async () => {
        try {
            const userId = session?.user?.id || userProfile?.id || localSessionId;
            if (!userId) return;
            
            const isGuest = !session?.user?.id && !userProfile?.id;
            let url = `/api/chat/sessions/${userId}`;
            
            // Siempre enviar los session_ids del localStorage como fallback (incluso si está logueado)
            // Esto es crucial mientras la base de datos no tenga la columna user_id en agent_sessions.
            // LEER SIEMPRE DE LOCALSTORAGE AQUÍ PARA EVITAR ESTADOS OBSOLETOS
            const savedListStr = localStorage.getItem('mealfit_guest_sessions_list');
            const latestSessionIds = savedListStr ? JSON.parse(savedListStr) : [currentSessionId];
            const sessionIdsParam = latestSessionIds.join(',');
            url += `?session_ids=${sessionIdsParam}`;
            
            const response = await fetchWithAuth(url);
            if (response.ok) {
                const data = await response.json();
                setChatSessions(data.sessions || []);
            }
        } catch (error) {
            console.error("Error fetching sessions:", error);
        }
    }, [session?.user?.id, userProfile?.id, localSessionId, currentSessionId]);

    const fetchSessionMessages = useCallback(async (sessionId) => {
        setIsLoadingHistory(true);
        try {
            const response = await fetchWithAuth(`/api/chat/history/${sessionId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    // Filtrar los mensajes de sistema/bienvenida si los hay guardados
                    const filteredMessages = data.messages.filter(m => m.content !== '¡Hola! Soy tu agente conversacional de nutrición IA. ¿En qué te puedo ayudar con tu plan alimenticio de hoy?' && m.content !== '¡Hola! Soy tu agente conversacional de nutrición IA. ¿En qué te puedo ayudar hoy?');
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
                        if (m.role === 'user') {
                            if (content.includes('[El usuario subió una imagen.')) {
                                const userMsgMatch = content.match(/Mensaje del usuario:\s*(.+)$/s);
                                if (userMsgMatch) {
                                    content = userMsgMatch[1].trim();
                                } else {
                                    content = content.replace(/\[El usuario subió una imagen\..+?\]\n\n?/s, '');
                                }
                            } else if (content.includes('[Sistema: El usuario acaba de subir una imagen')) {
                                // En este caso NO HAY mensaje del usuario original, todo era un prompt de sistema
                                content = '';
                            }
                            if (!content && isImage) content = '';
                        }
                        
                        return {
                            role: m.role,
                            content: content || '',
                            isImage: isImage || (m.role === 'user' && (m.content || '').includes('[El usuario subió una imagen.') || (m.content || '').includes('[Sistema: El usuario acaba de subir una imagen')),
                            imageUrl: imageUrl
                        };
                    }));
                } else {
                    setMessages([]);
                }
            } else {
                setMessages([]);
            }
        } catch (error) {
            console.error("Error fetching messages:", error);
            setMessages([]);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Cargar sesiones al abrir la pagina (para todos los usuarios)
    useEffect(() => {
        fetchChatSessions();
    }, [fetchChatSessions]);

    // Cargar historial de mensajes cuando cambia la sesión activa
    useEffect(() => {
        fetchSessionMessages(currentSessionId);
    }, [currentSessionId, fetchSessionMessages]);

    const handleNewChat = () => {
        const newId = crypto.randomUUID();
        setGuestSessionIds(prev => {
            const newList = [newId, ...prev];
            localStorage.setItem('mealfit_guest_sessions_list', JSON.stringify(newList));
            return newList;
        });
        setCurrentSessionId(newId);
        setMessages([]);
        setInput('');
        clearSelectedFile();
        fetchChatSessions();
        if (window.innerWidth <= 768) {
            setShowSidebar(false);
        }
    };

    const handleSend = async (overrideInput = null) => {
        const textToSend = typeof overrideInput === 'string' ? overrideInput : input;
        
        if ((!textToSend.trim() && !selectedFile) || isLoading) return;

        // Asegurar que el currentSessionId esté en la lista de localStorage
        const savedListStr = localStorage.getItem('mealfit_guest_sessions_list');
        const currentList = savedListStr ? JSON.parse(savedListStr) : [];
        if (!currentList.includes(currentSessionId)) {
            currentList.unshift(currentSessionId);
            localStorage.setItem('mealfit_guest_sessions_list', JSON.stringify(currentList));
            setGuestSessionIds(currentList);
        }

        const userMsg = textToSend.trim();
        const currentFile = selectedFile;
        const currentPreview = previewUrl;
        
        setInput('');
        clearSelectedFile();
        setIsLoading(true);

        const newMessages = [...messages];
        
        // Agregar mensaje visual si hay imagen
        if (currentFile) {
            newMessages.push({ role: 'user', content: userMsg || '', isImage: true, imageUrl: currentPreview });
        } else {
            newMessages.push({ role: 'user', content: userMsg });
        }
        
        setMessages(newMessages);

        try {
            let visionDescription = null;
            let uploadedImageUrl = null;
            
            // Manejar subida de imagen si existe
            if (currentFile) {
                const formData = new FormData();
                formData.append('file', currentFile);
                formData.append('user_id', session?.user?.id || userProfile?.id || localSessionId);
                formData.append('session_id', currentSessionId);
                
                const uploadRes = await fetchWithAuth('/api/diary/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const uploadData = await uploadRes.json();
                
                if (uploadData.success && uploadData.description) {
                    visionDescription = uploadData.description;
                    uploadedImageUrl = uploadData.image_url;
                }
                
                if (!userMsg) {
                    // Update base64 to actual URL for the current session state
                    setMessages(prev => {
                        const updated = [...prev];
                        if (updated.length > 0 && updated[updated.length - 1].isImage) {
                            updated[updated.length - 1].imageUrl = uploadedImageUrl || updated[updated.length - 1].imageUrl;
                        }
                        return updated;
                    });
                }
            }

            // Interactuar por el chat normal SIEMPRE (incluso si solo hay imagen)
            if (userMsg || currentFile) {
                // Incorporate image URL into promptToSend so it's persisted in DB
                let promptToSend = userMsg || "";
                if (currentFile && uploadedImageUrl) {
                    promptToSend = `[IMAGE: ${uploadedImageUrl}]\n${promptToSend}`;
                }
                
                // Obtener hora actual local formateada
                const currentTime = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });
                const timeContext = `(Hora actual del usuario: ${currentTime})`;
                
                // Si hay una descripción de visión, enriquecer el prompt con contexto de tiempo
                let enrichedPrompt = promptToSend;
                if (!userMsg && currentFile) {
                    enrichedPrompt = `${promptToSend}\n[Sistema: El usuario acaba de subir una imagen de comida. Análisis de la imagen: "${visionDescription}"]\n\n${timeContext}\nInstrucción: Actúa proactivamente. Menciona amigablemente lo que ves en la foto. REGLA VISUAL DE FORMATO: Usa SIEMPRE una lista con viñetas para desglosar sus macros y usa **negritas** para resaltarlos. Revisa detalladamente tu 'DIARIO DE HOY' en el system prompt: SI el usuario YA tiene registrada la comida principal de esta hora (ej: si ya cenó), NO le preguntes si esto es su cena, asume que es un snack extra o pregúntale por qué está comiendo algo adicional; si NO tiene nada registrado para esta hora, entonces SÍ pregúntale brevemente si esta foto corresponde a su comida del momento (ej: su cena). No pongas el prefijo [Sistema]. Sólo responde directo y conversacional.`;
                } else if (visionDescription) {
                    enrichedPrompt = `[El usuario subió una imagen. Análisis de la imagen: "${visionDescription}"]\n\n${timeContext}\nMensaje del usuario: ${promptToSend}`;
                } else {
                    enrichedPrompt = `[${timeContext}]\nMensaje del usuario: ${promptToSend}`;
                }
                
                setStreamingStatus('Conectando...');
                
                const now = new Date();
                const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                
                const response = await fetchWithAuth('/api/chat/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: currentSessionId,
                        user_id: session?.user?.id || userProfile?.id || localSessionId,
                        prompt: enrichedPrompt,
                        current_plan: planData,
                        form_data: formData,
                        local_date: localDateStr,
                        tz_offset: now.getTimezoneOffset()
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
                        
                        // Guardar la última línea incompleta en el buffer
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

                                        // Acciones post-respuesta
                                        fetchChatSessions();
                                        if (messages.length === 0) {
                                            setTimeout(fetchChatSessions, 4000);
                                            setTimeout(fetchChatSessions, 8000);
                                        }

                                        if (dataObj.updated_fields && Object.keys(dataObj.updated_fields).length > 0) {
                                            Object.entries(dataObj.updated_fields).forEach(([field, val]) => {
                                                if (updateData) updateData(field, val);
                                            });
                                        }
                                        // Si el agente generó un plan nuevo, actualizarlo
                                        if (dataObj.new_plan) {
                                            saveGeneratedPlan(dataObj.new_plan);
                                        }
                                        
                                        // Actualizar contador de créditos en tiempo real
                                        setTimeout(async () => {
                                            await checkPlanLimit(session?.user?.id || userProfile?.id || localSessionId);
                                        }, 1000);
                                        
                                    } else if (dataObj.type === 'error') {
                                        setIsLoading(false);
                                        setStreamingStatus(null);
                                        setMessages(prev => [...prev, { role: 'model', content: `❌ Error de agente: ${dataObj.message}` }]);
                                    }
                                } catch (e) {
                                    // Ignorar lineas JSON rotas temporalmente
                                }
                            }
                        }
                    }
                } else {
                    let errData = {};
                    try { errData = await response.json(); } catch(e){}
                    setMessages(prev => [...prev, { role: 'model', content: `❌ Error al comunicarse con la IA: ${errData.detail || ''}` }]);
                }
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

    const renderInputArea = (isCentered = false) => (
        <div className="input-wrapper" style={{
            padding: isCentered ? '1.5rem 1.25rem 2.5rem 1.25rem' : '1.25rem 2rem',
            background: isCentered ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: isCentered ? 'none' : 'blur(12px)',
            borderTopLeftRadius: isCentered ? '2rem' : '0',
            borderTopRightRadius: isCentered ? '2rem' : '0',
            borderTop: isCentered ? 'none' : '1px solid rgba(226, 232, 240, 0.8)',
            boxShadow: isCentered ? '0 -2px 20px rgba(0,0,0,0.04)' : 'none',
            position: isCentered ? 'absolute' : 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            zIndex: 10
        }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                {isCentered && (
                    <div style={{ 
                        display: 'none' 
                    }}>
                        {/* Removido temporalmente para evitar redundancia con el placeholder */}
                    </div>
                )}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: isCentered ? '#f8fafc' : '#f8fafc',
                    borderRadius: isCentered ? '2rem' : (previewUrl ? '1rem' : '2rem'),
                    padding: isCentered ? '0.5rem 0.5rem 0.5rem 1rem' : (previewUrl ? '0.5rem' : '0.5rem 0.5rem 0.5rem 1rem'),
                    boxShadow: 'none',
                    border: isCentered ? '1px solid #e2e8f0' : '1px solid #e2e8f0',
                    transition: 'all 0.2s ease',
                }}>
                    {/* Image Preview Area - Integrated inside the input container */}
                    {previewUrl && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginLeft: '3rem',
                            marginBottom: '0.5rem',
                            marginRight: '0.5rem'
                        }}>
                            <div style={{
                                display: 'inline-block',
                                position: 'relative',
                                padding: '4px',
                                background: '#ffffff',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <img src={previewUrl} alt="Preview" style={{ height: '48px', borderRadius: '6px', opacity: isLoading ? 0.5 : 1 }} />
                                <button
                                    onClick={clearSelectedFile}
                                    disabled={isLoading}
                                    style={{
                                        position: 'absolute', top: '-6px', right: '-6px',
                                        background: '#ef4444', color: 'white', border: 'none',
                                        borderRadius: '50%', width: '18px', height: '18px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                    }}
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'nowrap',
                        width: '100%'
                    }}>
                        <input
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoading}
                            style={{
                                background: 'transparent',
                                color: '#64748b',
                                border: 'none',
                                borderRadius: '50%',
                                width: '40px',
                                height: '40px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: isLoading ? 'default' : 'pointer',
                                transition: 'all 0.2s',
                                flexShrink: 0
                            }}
                            onMouseEnter={(e) => { if(!isLoading) e.currentTarget.style.color = '#3b82f6'; }}
                            onMouseLeave={(e) => { if(!isLoading) e.currentTarget.style.color = '#64748b'; }}
                        >
                            <Plus size={20} />
                        </button>

                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            placeholder="Pregúntale a MealfitRD"
                            disabled={isLoading}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                padding: '0 0.5rem',
                                borderRadius: '0',
                                fontSize: '1rem',
                                outline: 'none',
                                color: '#1e293b',
                                fontFamily: 'inherit',
                                minWidth: 0 // Prevents input from breaking flex layout
                            }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={(!input.trim() && !selectedFile) || isLoading}
                            style={{
                                background: (input.trim() || selectedFile) && !isLoading ? '#1e293b' : 'transparent',
                                color: (input.trim() || selectedFile) && !isLoading ? 'white' : '#94a3b8',
                                border: 'none',
                                borderRadius: '50%',
                                width: '40px',
                                height: '40px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: (input.trim() || selectedFile) && !isLoading ? 'pointer' : 'default',
                                transition: 'all 0.2s',
                                flexShrink: 0,
                                marginLeft: 'auto',
                                marginRight: '2px'
                            }}
                        >
                            {isLoading ? <Loader2 className="spin-fast" size={20} /> : <Send size={18} style={{ marginLeft: (input.trim() || selectedFile) ? '2px' : '0' }} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <DashboardLayout noPaddingMobile={true}>
            <div className="agent-container" style={{
                display: 'flex',
                flexDirection: 'row',
                height: 'calc(100vh - 4rem)',
                background: '#ffffff',
                borderRadius: '1.5rem',
                boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                overflow: 'hidden',
                margin: '0 auto',
                maxWidth: '1200px',
                width: '100%',
                position: 'relative'
            }}>
                {/* Overlay para Plan Gratis */}
                {!isPlus && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(255, 255, 255, 0.4)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 50,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        padding: '2rem',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            background: 'white',
                            padding: '2rem',
                            borderRadius: '1.25rem',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                            border: '1px solid #F1F5F9',
                            maxWidth: '320px'
                        }}>
                            <div style={{
                                background: '#FEF2F2', color: '#EF4444', height: 56, width: 56,
                                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 1.25rem'
                            }}>
                                <Lock size={28} strokeWidth={2.5} />
                            </div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.75rem', marginTop: 0 }}>Función Premium</h3>
                            <p style={{ fontSize: '0.95rem', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                                Tu Asistente Experto Nutricional requiere una suscripción Plus. ¡Mejora tu plan!
                            </p>
                        </div>
                    </div>
                )}

                {/* Overlay para móvil */}
                {showSidebar && (
                    <div 
                        className="sidebar-overlay"
                        onClick={() => setShowSidebar(false)}
                    />
                )}

                {/* Sidebar Historial */}
                <div className="agent-sidebar" style={{
                    width: showSidebar ? '260px' : '0px',
                    borderRight: showSidebar ? '1px solid rgba(226, 232, 240, 0.6)' : 'none',
                    background: '#f8f9fb',
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0
                }}>
                    <div style={{ padding: '1.25rem 1rem', display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={handleNewChat}
                            style={{
                                width: '100%',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '1.5rem',
                                padding: '0.8rem 1.2rem',
                                color: '#4F46E5', // Changed to match brand
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontSize: '1rem', // Bigger font
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
                    
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', padding: '0.75rem 1rem', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Recientes
                        </h3>
                        {chatSessions.length === 0 ? (
                            <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#94a3b8', padding: '2rem 1rem', lineHeight: 1.5 }}>
                                Tus conversaciones aparecerán aquí.
                            </div>
                        ) : (
                            chatSessions.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        setCurrentSessionId(s.id);
                                        if (window.innerWidth <= 768) {
                                            setShowSidebar(false);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '0.75rem 1rem',
                                        background: currentSessionId === s.id ? '#eef2ff' : 'transparent', // Indigo lightest
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
                                        fontWeight: currentSessionId === s.id ? 600 : 500, 
                                        fontSize: '0.95rem', 
                                        color: currentSessionId === s.id ? '#4F46E5' : '#475569',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',

                                        flex: 1
                                    }}>
                                        {s.title}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat Area container */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0, // previene overflow en flex
                    position: 'relative',
                    background: '#ffffff'
                }}>
                {/* Chat Header */}
                <div style={{
                    padding: '0.75rem 1.25rem',
                    background: messages.length === 0 ? '#f4f7fc' : 'rgba(255,255,255,0.85)',
                    backdropFilter: messages.length === 0 ? 'none' : 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'absolute',
                    top: 0,
                    width: '100%',
                    zIndex: 10,
                    borderBottom: messages.length === 0 ? 'none' : '1px solid rgba(226, 232, 240, 0.6)'
                }}>
                    {/* Left: Menu */}
                    <button 
                        onClick={() => setShowSidebar(!showSidebar)}
                        style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            color: '#1e293b',
                            padding: '0.4rem',
                            borderRadius: '50%',
                            transition: 'all 0.15s',
                            marginLeft: '-0.4rem'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        <History size={24} strokeWidth={1.5} />
                    </button>
                    
                    {/* Center: Title */}
                    <span className="agent-header-title" style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 400, 
                        color: '#0f172a', 
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        letterSpacing: '-0.02em'
                    }}>
                        MealfitRD
                    </span>

                </div>

                {/* Mensajes o Pantalla Principal (Gemini Style) */}
                <div className="messages-container" style={{
                    flex: 1,
                    padding: messages.length === 0 ? '5rem 1.5rem 0 1.5rem' : '5rem 2rem 0.5rem 2rem', 
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    alignItems: messages.length === 0 ? 'flex-start' : 'center',
                    background: messages.length === 0 ? '#ffffff' : '#ffffff',
                    scrollBehavior: 'smooth'
                }}>
                    {messages.length === 0 && !isLoadingHistory ? (
                        <div className="empty-state-wrapper" style={{ width: '100%', maxWidth: '850px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ 
                                animation: 'fadeInUp 0.6s ease-out forwards',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.2rem',
                                marginBottom: '1.25rem',
                                marginTop: '1.5rem',
                                alignItems: 'flex-start'
                            }}>
                                <h1 className="welcome-heading" style={{ 
                                    fontSize: '2rem', 
                                    fontWeight: 500, 
                                    color: '#0f172a', 
                                    margin: 0,
                                    letterSpacing: '-0.01em',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem'
                                }}>
                                    <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>🤖</span>
                                    Hola, {userProfile?.name?.split(' ')[0]?.toLowerCase() || 'amigo'}
                                </h1>
                                <h2 style={{ 
                                    fontSize: '2.5rem', 
                                    fontWeight: 400, 
                                    color: '#64748b', 
                                    margin: 0, 
                                    letterSpacing: '-0.03em',
                                    lineHeight: 1.2
                                }}>
                                    ¿Por dónde empezamos?
                                </h2>
                            </div>
                            
                            <div className="empty-state-pills" style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '0.6rem', 
                                alignItems: 'flex-start',
                                marginTop: '0.5rem'
                            }}>
                                {[
                                    { icon: '🖼️', text: 'Analizar mi comida' },
                                    { icon: '💪', text: 'Dieta para ganar volumen' },
                                    { icon: '✨', text: 'Plan de pérdida de peso' },
                                    { icon: '🍳', text: 'Receta alta en proteína' }
                                ].map((suggestion, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setInput(suggestion.text)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.6rem',
                                            padding: '0.75rem 1.25rem',
                                            background: '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '2rem',
                                            color: '#334155',
                                            fontSize: '0.95rem',
                                            fontWeight: 400,
                                            cursor: 'pointer',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                            transition: 'all 0.2s ease',
                                            width: 'fit-content'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                                    >
                                        <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{suggestion.icon}</span> 
                                        {suggestion.text}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            maxWidth: '800px',
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2rem',
                            paddingBottom: '0.5rem'
                        }}>
                            {isLoadingHistory ? (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem', color: '#94A3B8', gap: '0.5rem' }}>
                                    <Loader2 className="spin-fast" size={20} /> Cargando mensajes...
                                </div>
                            ) : (
                                messages.map((msg, i) => (
                                    <div key={i} style={{
                                        display: 'flex',
                                        gap: '0.75rem',
                                        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                        alignItems: 'flex-start'
                                    }}>
                                        {msg.role === 'model' && (
                                            <div style={{
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
                                        <div style={{
                                            flex: 1,
                                            maxWidth: '95%',
                                            color: msg.role === 'user' ? '#0f172a' : '#1e293b',
                                            fontSize: '0.95rem',
                                            lineHeight: 1.6,
                                            whiteSpace: 'pre-wrap',
                                            background: msg.role === 'user' ? '#f4f7fc' : '#ffffff',
                                            padding: msg.role === 'user' ? '0.75rem 1.25rem' : '1rem 0',
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
                                        </div>
                                    </div>
                                ))
                            )}
                            {isLoading && (
                                <div style={{ 
                                    display: 'flex', 
                                    gap: '0.75rem', 
                                    alignItems: 'center',
                                    color: '#475569',
                                    padding: '0.5rem 0',
                                    fontSize: '0.95rem',
                                    fontWeight: 500,
                                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                                }}>
                                    <div className="spin-slow" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🤖</div> 
                                    <span style={{
                                        background: 'linear-gradient(90deg, #475569 0%, #94a3b8 50%, #475569 100%)',
                                        backgroundSize: '200% auto',
                                        color: 'transparent',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        animation: 'shimmer 2s linear infinite'
                                    }}>{streamingStatus || 'Pensando...'}</span>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Area condicional para input */}
                {/* Input Area (Pinned to bottom if messages exist) */}
                {messages.length > 0 && renderInputArea(false)}
                {/* Overlay Input Area for Empty State */}
                {messages.length === 0 && renderInputArea(true)}
                
                </div> {/* End of Chat Area Container */}
            </div>

            <style>{`
                .markdown-chat { font-size: 0.95rem; line-height: 1.6; }
                .markdown-chat p { margin-top: 0; margin-bottom: 0.75rem; }
                .markdown-chat p:last-child { margin-bottom: 0; }
                .markdown-chat ul, .markdown-chat ol { margin-top: 0; margin-bottom: 0.75rem; padding-left: 1.5rem; }
                .markdown-chat ul:last-child, .markdown-chat ol:last-child { margin-bottom: 0; }
                .markdown-chat li { margin-bottom: 0.25rem; }
                .markdown-chat strong { font-weight: 700; color: inherit; }

                .spin-fast { animation: spin 1s linear infinite; }
                .spin-slow { animation: spin 4s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
                @keyframes shimmer { to { background-position: 200% center; } }
                .wave-anim { animation: wave 2.5s infinite; transform-origin: 70% 70%; }
                @keyframes wave {
                    0% { transform: rotate(0deg); }
                    10% { transform: rotate(14deg); }
                    20% { transform: rotate(-8deg); }
                    30% { transform: rotate(14deg); }
                    40% { transform: rotate(-4deg); }
                    50% { transform: rotate(10deg); }
                    60% { transform: rotate(0deg); }
                    100% { transform: rotate(0deg); }
                }

                /* Mobile sidebar styles */
                @media (max-width: 768px) {
                    .agent-container {
                        height: 100% !important;
                        border-radius: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                        max-width: none !important;
                        width: 100% !important;
                        flex: 1 !important;
                    }
                    .input-wrapper {
                        padding: 0.75rem 1rem calc(0.5rem + env(safe-area-inset-bottom)) 1rem !important;
                    }
                    .agent-header-title {
                        display: none !important; /* Oculta la doble cabecera MealfitRD */
                    }
                    .agent-sidebar {
                        position: absolute;
                        top: 0;
                        left: 0;
                        height: 100%;
                        z-index: 30;
                        box-shadow: 4px 0 24px rgba(0,0,0,0.1);
                        border-top-left-radius: 1.5rem;
                        border-bottom-left-radius: 1.5rem;
                    }
                    .sidebar-overlay {
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.4);
                        z-index: 25;
                        backdrop-filter: blur(2px);
                        -webkit-backdrop-filter: blur(2px);
                        border-radius: 1.5rem;
                    }
                }
                @media (min-width: 769px) {
                    .sidebar-overlay {
                        display: none;
                    }
                    .messages-container {
                        justify-content: flex-start !important;
                        align-items: center !important;
                    }
                    .empty-state-wrapper {
                        margin-top: 10vh !important;
                        margin-bottom: auto !important;
                        max-width: 800px !important;
                        align-items: center !important;
                        text-align: center;
                    }
                    .welcome-heading {
                        justify-content: center !important;
                        width: 100%;
                    }
                    .empty-state-pills {
                        flex-direction: row !important;
                        flex-wrap: wrap !important;
                        align-items: center !important;
                        justify-content: center !important;
                    }
                }
            `}</style>
        </DashboardLayout>
    );
};
export default AgentPage;
