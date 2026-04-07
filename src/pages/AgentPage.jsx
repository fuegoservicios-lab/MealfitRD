import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../context/AssessmentContext';
import { Send, Bot, Loader2, Paperclip, X, Image as ImageIcon, Plus, MessageSquare, History, Menu, Apple, Dumbbell, Utensils, Camera, Sparkles, Lock, Trash2, Check, Mic, ArrowUp, Square, ThumbsUp, ThumbsDown, RefreshCw, Copy, MoreVertical, LayoutDashboard, ShoppingBag, Clock, Settings, Edit2, Ghost } from 'lucide-react';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { fetchWithAuth } from '../config/api';
import ReactMarkdown from 'react-markdown';
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
        color: active ? '#4f46e5' : '#64748b', // Más oscuro y visible (slate-500)
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

const AgentPage = () => {
    const { session, planData, formData, updateData, saveGeneratedPlan, userProfile, isPlus, checkPlanLimit } = useAssessment();
    const navigate = useNavigate();
    const [titlePollCount, setTitlePollCount] = useState(0);
    const [showNavMenu, setShowNavMenu] = useState(false);
    const navMenuRef = useRef(null);

    // Close nav menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (navMenuRef.current && !navMenuRef.current.contains(e.target)) {
                setShowNavMenu(false);
            }
        };
        if (showNavMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showNavMenu]);
    
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
            let list = JSON.parse(savedList);
            if (!list.includes(localSessionId)) {
                list.unshift(localSessionId);
                list = list.slice(0, 40);
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
                            // Leer desde localStorage para evitar leer estado antiguo (stale closure)
                            const savedSessionId = localStorage.getItem('mealfit_current_session');
                            const isCurrentValid = data.sessions.some(s => s.id === savedSessionId);
                            
                            if (!isCurrentValid) {
                                setCurrentSessionId(data.sessions[0].id);
                            } else if (currentSessionId !== savedSessionId) {
                                setCurrentSessionId(savedSessionId);
                            }
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
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [showSidebar, setShowSidebar] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 768 : true);

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingStatus, setStreamingStatus] = useState(null);
    const [abortController, setAbortController] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [editingSessionId, setEditingSessionId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [previewUrl, setPreviewUrl] = useState(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const originalInputRef = useRef('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'es-DO';

                recognition.onstart = () => setIsListening(true);
                
                recognition.onresult = (event) => {
                    let currentTranscript = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        currentTranscript += event.results[i][0].transcript;
                    }
                    setInput((originalInputRef.current + ' ' + currentTranscript).trim());
                };

                recognition.onerror = (event) => {
                    console.error("Speech recognition error", event.error);
                    setIsListening(false);
                };

                recognition.onend = () => {
                    setIsListening(false);
                };

                recognitionRef.current = recognition;
            }
        }
    }, []);

    const toggleDictation = () => {
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            if (recognitionRef.current) {
                originalInputRef.current = input;
                try {
                    recognitionRef.current.start();
                } catch(e) { console.error(e); }
            } else {
                alert('Tu navegador no soporta el dictado por voz (Se recomienda Chrome o Safari).');
            }
        }
    };

    const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);
    const loadingPhrases = [
        "Revisando tus preferencias y contexto...",
        "Evaluando tu perfil y macros...",
        "Analizando tu objetivo con Inteligencia Nutricional...",
        "Alineando tu genética con el plan...",
        "Calculando la mejor respuesta metabólica..."
    ];

    useEffect(() => {
        let interval;
        if (isLoading) {
            interval = setInterval(() => {
                setLoadingPhraseIdx(prev => (prev + 1) % loadingPhrases.length);
            }, 2500); // Rotar cada 2.5s
        } else {
            setLoadingPhraseIdx(0);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

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
            
            if (isGuest) {
                // Para invitados, enviamos la lista de IDs guardada en localStorage
                const savedListStr = localStorage.getItem('mealfit_guest_sessions_list');
                const latestSessionIds = savedListStr ? JSON.parse(savedListStr).slice(0, 40) : [currentSessionId];
                const sessionIdsParam = latestSessionIds.join(',');
                url += `?session_ids=${sessionIdsParam}`;
            }
            // Si no es guest, el backend buscará por user_id directamente en la BD (Multi-dispositivo)
            
            const response = await fetchWithAuth(url);
            if (response.ok) {
                const data = await response.json();
                setChatSessions(prev => {
                    const newSessions = data.sessions || [];
                    const generating = prev.filter(s => s.title === 'Generando título...');
                    const merged = [...newSessions];
                    
                    generating.forEach(gen => {
                        const existingIdx = merged.findIndex(s => s.id === gen.id);
                        if (existingIdx === -1) {
                            merged.unshift(gen);
                        } else {
                            // Si el servidor solo tiene el fallback snippet del mensaje y no el title real,
                            // o si viene vacío, preservamos el placeholder visual:
                            if (merged[existingIdx].is_fallback !== false && gen.title === 'Generando título...') {
                                merged[existingIdx].title = 'Generando título...';
                            }
                        }
                    });
                    return merged;
                });
            }
        } catch (error) {
            console.error("Error fetching sessions:", error);
        } finally {
            setIsLoadingSessions(false);
        }
    }, [session?.user?.id, userProfile?.id, localSessionId, currentSessionId]);

    const fetchSessionMessages = useCallback(async (sessionId, retryCount = 0) => {
        setIsLoadingHistory(true);
        let response;
        try {
            response = await fetchWithAuth(`/api/chat/history/${sessionId}`);
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
                        
                        // Limpiar prefijo de visión y contexto enriquecido del historial
                        if (m.role === 'user') {
                            // Limpiar hora del usuario
                            content = content.replace(/\[\(Hora actual del usuario:.*?\)\]\n?/gi, '');
                            
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
                            
                            // Limpiar "Mensaje del usuario:" que inyecta el backend para darle contexto al LLM
                            content = content.replace(/Mensaje del usuario:\s*/gi, '');
                            
                            // Remover la sección de <dietary_context>
                            content = content.replace(/<dietary_context>[\s\S]*?<\/dietary_context>/, '').trim();
                        }
                        
                        // Si el bot genera el system title, lo ocultamos
                        if (m.role === 'model' && content.startsWith('[SYSTEM_TITLE]')) {
                            return null;
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
            } else if (response.status === 403 || response.status === 401) {
                // Reintentar un par de veces por si hay un retraso en la hidratación del token
                if (retryCount < 2) {
                    console.warn(`⏳ [fetchSessionMessages] Esperando autenticación para ${sessionId}... (intento ${retryCount+1})`);
                    setTimeout(() => fetchSessionMessages(sessionId, retryCount + 1), 800);
                    return;
                }
                // Después de reintentos, simplemente mostrar vacío sin destruir la sesión
                console.warn(`⚠️ No se pudo cargar historial de ${sessionId} (${response.status}).`);
                setMessages([]);
            } else {
                setMessages([]);
            }
        } catch (error) {
            console.error("Error fetching session messages:", error);
            if (retryCount < 2) {
                setTimeout(() => fetchSessionMessages(sessionId, retryCount + 1), 600);
                return;
            }
            setMessages([]);
        } finally {
            if (retryCount >= 2 || (response && response.ok)) {
                setIsLoadingHistory(false);
            }
        }
    }, [setMessages, setIsLoadingHistory]);

    const handleDeleteChat = async (sessionIdToDelete, e) => {
        if (e) e.stopPropagation();
        try {
            const response = await fetchWithAuth(`/api/chat/session/${sessionIdToDelete}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                setChatSessions(prev => prev.filter(s => s.id !== sessionIdToDelete));
                
                // Si borramos el chat actual activo, redirigimos a un chat nuevo
                if (currentSessionId === sessionIdToDelete) {
                    const newId = crypto.randomUUID();
                    localStorage.setItem('mealfit_current_session', newId);
                    setCurrentSessionId(newId);
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error("Error al eliminar el chat devuelto por el servidor:", errorData);
            }
        } catch (error) {
            console.error("Excepción eliminando chat:", error);
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Cargar sesiones al abrir la pagina (para todos los usuarios)
    useEffect(() => {
        fetchChatSessions();
    }, [fetchChatSessions]);

    // Polling moderado (2500ms) para actualizar el título dinámico, con tope de 8 intentos (~20s)
    useEffect(() => {
        const isGenerating = chatSessions.some(s => s.title === 'Generando título...');
        if (!isGenerating) {
            setTitlePollCount(0);
            return;
        }
        if (titlePollCount >= 8) return; // Tope: evitar polling infinito

        const intervalId = setInterval(() => {
            setTitlePollCount(prev => prev + 1);
            fetchChatSessions();
        }, 2500);

        return () => clearInterval(intervalId);
    }, [chatSessions, fetchChatSessions, titlePollCount]);

    // Cargar historial de mensajes de forma segura (evitar 403 prematuro)
    useEffect(() => {
        // SIEMPRE esperar a que la sesión de Supabase esté hidratada antes de hacer peticiones autenticadas
        if (!session?.user?.id) return;
        if (!currentSessionId) return;

        fetchSessionMessages(currentSessionId);
    }, [currentSessionId, fetchSessionMessages, session?.user?.id]);

    const handleNewChat = () => {
        const newId = crypto.randomUUID();
        setGuestSessionIds(prev => {
            const newList = [newId, ...prev].slice(0, 40);
            localStorage.setItem('mealfit_guest_sessions_list', JSON.stringify(newList));
            return newList;
        });
        setCurrentSessionId(newId);
        setMessages([{ role: 'model', content: '¡Hola! Soy tu agente conversacional de nutrición IA. ¿En qué te puedo ayudar hoy?', isWelcome: true }]);
        setInput('');
        clearSelectedFile();
        fetchChatSessions();
        if (window.innerWidth <= 768) {
            setShowSidebar(false);
        }
    };


    const handleSend = async (overrideInput = null) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(40); // Haptic feedback on send
        }
        const textToSend = typeof overrideInput === 'string' ? overrideInput : input;
        
        if ((!textToSend.trim() && !selectedFile) || isLoading) return;

        if (isListening) {
            recognitionRef.current?.stop();
        }

        // Asegurar que el currentSessionId esté en la lista de localStorage
        const savedListStr = localStorage.getItem('mealfit_guest_sessions_list');
        let currentList = savedListStr ? JSON.parse(savedListStr) : [];
        if (!currentList.includes(currentSessionId)) {
            currentList.unshift(currentSessionId);
            currentList = currentList.slice(0, 40);
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
                const currentTzOffset = new Date().getTimezoneOffset();
                formData.append('tz_offset_mins', currentTzOffset.toString());
                
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
                
                // Limpiar mensaje de bienvenida si es el primero del usuario
                if (newMessages.length > 0 && newMessages[0].isWelcome) {
                    newMessages.shift();
                }

                setChatSessions((prev) => {
                    const exists = prev.some(s => s.id === currentSessionId);
                    if (!exists) {
                        return [{ id: currentSessionId, title: 'Generando título...', created_at: new Date().toISOString() }, ...prev];
                    }
                    return prev;
                });
                
                const now = new Date();
                const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                
                const controller = new AbortController();
                setAbortController(controller);
                
                const response = await fetchWithAuth('/api/chat/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
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
            if (error.name === 'AbortError') {
                console.log("Streaming cancelado por el usuario.");
                return;
            }
            console.error("Chat Error:", error);
            setMessages(prev => [...prev, { role: 'model', content: '❌ Error de conexión al servidor.' }]);
        } finally {
            setIsLoading(false);
            setStreamingStatus(null);
            setAbortController(null);
        }
    };

    const handleStopGeneration = () => {
        if (abortController) {
            console.log("Abortando generación manual...");
            abortController.abort();
            setAbortController(null);
            setIsLoading(false);
            setStreamingStatus(null);
        }
    };

    const handleRegenerate = (modelMsgIndex) => {
        // Find the last user message before this model message
        const lastUserMsg = messages.slice(0, modelMsgIndex).reverse().find(m => m.role === 'user');
        if (lastUserMsg && !isLoading) {
            handleSend(lastUserMsg.content);
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
            zIndex: 10,
            transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : 'none',
            transition: 'transform 0.15s ease-out',
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
                            title="Adjuntar imagen"
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
                        {isLoading ? (
                            <button
                                onClick={handleStopGeneration}
                                title="Detener generación"
                                style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '40px',
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    marginLeft: 'auto',
                                    marginRight: '2px',
                                    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                                }}
                            >
                                <Square size={16} fill="white" />
                            </button>
                        ) : (input.trim() || selectedFile) ? (
                            <button
                                className="touch-scale"
                                onClick={handleSend}
                                disabled={isLoading}
                                style={{
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '40px',
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: isLoading ? 'default' : 'pointer',
                                    flexShrink: 0,
                                    marginLeft: 'auto',
                                    marginRight: '2px'
                                }}
                            >
                                <ArrowUp size={22} strokeWidth={2.5} />
                            </button>
                        ) : (
                            <button
                                className="touch-scale"
                                onClick={toggleDictation}
                                style={{
                                    background: isListening ? '#ef4444' : 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '40px',
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: isLoading ? 'default' : 'pointer',
                                    flexShrink: 0,
                                    marginLeft: 'auto',
                                    marginRight: '2px'
                                }}
                                title="Dictado por voz"
                            >
                                <Mic size={20} className={isListening ? "pulse-anim-mic" : ""} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );


    // --- iOS Keyboard: adjust input wrapper using visualViewport API ---
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const handleResize = () => {
            const offset = window.innerHeight - vv.height;
            setKeyboardOffset(offset > 50 ? offset : 0);
        };
        vv.addEventListener('resize', handleResize);
        vv.addEventListener('scroll', handleResize);
        return () => {
            vv.removeEventListener('resize', handleResize);
            vv.removeEventListener('scroll', handleResize);
        };
    }, []);

    // --- Swipe gestures for mobile sidebar ---
    const touchStartRef = useRef(null);
    const touchEndRef = useRef(null);

    const handleTouchStart = (e) => {
        touchEndRef.current = null;
        touchStartRef.current = e.targetTouches[0].clientX;
    };

    const handleTouchMove = (e) => {
        touchEndRef.current = e.targetTouches[0].clientX;
    };

    const handleTouchEnd = () => {
        if (!touchStartRef.current || !touchEndRef.current) return;
        const distance = touchStartRef.current - touchEndRef.current;
        if (distance < -60 && !showSidebar) {
            setShowSidebar(true);
        } else if (distance > 60 && showSidebar) {
            setShowSidebar(false);
        }
    };

    const getGroupedSessions = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastMonth = new Date(today);
        lastMonth.setDate(lastMonth.getDate() - 30);

        const groups = {
            'Hoy': [],
            'Últimos 30 días': [],
            'Más antiguos': []
        };

        chatSessions.forEach(s => {
            const dateStr = s.last_activity || s.created_at;
            let d;
            if (dateStr) {
                d = new Date(dateStr);
            }
            if (!d || isNaN(d.getTime())) {
                groups['Más antiguos'].push(s);
                return;
            }

            if (d >= today) {
                groups['Hoy'].push(s);
            } else if (d >= lastMonth) {
                groups['Últimos 30 días'].push(s);
            } else {
                groups['Más antiguos'].push(s);
            }
        });

        return [
            { id: 'hoy', label: 'Hoy', items: groups['Hoy'] },
            { id: '30dias', label: '', items: groups['Últimos 30 días'] },
            { id: 'antiguos', label: 'Más antiguos', items: groups['Más antiguos'] }
        ].filter(g => g.items.length > 0);
    };

    const groupedSessions = getGroupedSessions();
    return (
        <DashboardLayout noPaddingMobile={true}>
            <style>{`
                .chat-session-btn .chat-actions-hover {
                    opacity: 0;
                    pointer-events: none;
                }
                .chat-session-btn:hover .chat-actions-hover {
                    opacity: 1;
                    pointer-events: auto;
                }
            `}</style>
            <div className="agent-container" 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                display: 'flex',
                flexDirection: 'row',
                height: 'calc(100dvh - 4rem)',
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
                                                
                                                {/* Botón de eliminar (Hover) */}
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
                <div className="mobile-chat-header" style={{
                    padding: '0.75rem 1.25rem',
                    paddingTop: 'calc(0.75rem + max(env(safe-area-inset-top), 24px))',
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

                    {/* Right: 3-dot nav menu (mobile) */}
                    <div ref={navMenuRef} className="nav-menu-wrapper" style={{ position: 'relative', marginRight: '-0.4rem' }}>
                        <button
                            onClick={() => setShowNavMenu(!showNavMenu)}
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
                                transition: 'all 0.15s'
                            }}
                        >
                            <MoreVertical size={22} strokeWidth={2} />
                        </button>
                        {showNavMenu && (
                            <div className="nav-dropdown" style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '0.5rem',
                                background: 'rgba(255,255,255,0.97)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                borderRadius: '1rem',
                                boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
                                padding: '0.5rem',
                                minWidth: '200px',
                                zIndex: 100,
                                animation: 'fadeSlideDown 0.2s ease'
                            }}>
                                {[
                                    { icon: LayoutDashboard, label: 'Mi Plan', path: '/dashboard' },
                                    { icon: Utensils, label: 'Recetas', path: '/dashboard/recipes' },
                                    { icon: ShoppingBag, label: 'Lista de Compras', path: '/dashboard/shopping' },
                                    { icon: Clock, label: 'Historial', path: '/history' },
                                    { icon: Settings, label: 'Ajustes', path: '/dashboard/settings' }
                                ].map((item) => (
                                    <button
                                        key={item.path}
                                        onClick={() => { navigate(item.path); setShowNavMenu(false); }}
                                        className="nav-dropdown-item"
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem 1rem',
                                            background: 'transparent',
                                            border: 'none',
                                            borderRadius: '0.65rem',
                                            color: '#334155',
                                            fontSize: '0.95rem',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            textAlign: 'left'
                                        }}
                                        onTouchStart={e => e.currentTarget.style.background = '#f1f5f9'}
                                        onTouchEnd={e => e.currentTarget.style.background = 'transparent'}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <item.icon size={20} strokeWidth={1.8} style={{ color: '#64748b' }} />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                </div>

                {/* Mensajes o Pantalla Principal (Gemini Style) */}
                <div className="messages-container" style={{
                    flex: 1,
                    padding: messages.length === 0 ? 'calc(4.5rem + max(env(safe-area-inset-top), 24px)) 1.5rem 0 1.5rem' : 'calc(4.5rem + max(env(safe-area-inset-top), 24px)) 2rem 0.5rem 2rem', 
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
                                    Hola, {userProfile?.full_name?.split(' ')[0] || formData?.name || 'amigo'}
                                </h1>
                                <h2 className="welcome-sub" style={{ 
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
                                        className="suggestion-pill"
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
                                        <span className="suggestion-pill-icon" style={{ fontSize: '1.2rem', lineHeight: 1 }}>{suggestion.icon}</span> 
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
                                                    onRegenerate={() => handleRegenerate(i)} 
                                                />
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
                                    <div className="typing-dots-container" style={{ display: 'none' }}>
                                        <div className="typing-dot" style={{ animation: 'typingBounce 1.4s ease-in-out infinite' }} />
                                        <div className="typing-dot" style={{ animation: 'typingBounce 1.4s ease-in-out 0.2s infinite' }} />
                                        <div className="typing-dot" style={{ animation: 'typingBounce 1.4s ease-in-out 0.4s infinite' }} />
                                    </div>
                                    <span className="loading-text-desktop" style={{
                                        background: 'linear-gradient(90deg, #475569 0%, #94a3b8 50%, #475569 100%)',
                                        backgroundSize: '200% auto',
                                        color: 'transparent',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        animation: 'shimmer 2s linear infinite',
                                        transition: 'opacity 0.3s ease-in-out'
                                    }}>{streamingStatus ? loadingPhrases[loadingPhraseIdx] : 'Pensando...'}</span>
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
                @keyframes pulse-mic { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }
                .pulse-anim-mic { animation: pulse-mic 1.5s infinite ease-in-out; }
                @keyframes shimmer { to { background-position: 200% center; } }
                @keyframes cyberSweep { 0% { left: -50%; } 100% { left: 100%; } }
                @keyframes fadeSlideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
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

                /* --- Custom Scrollbar (Sidebar & PC Chat) --- */
                .sidebar-scrollable, .messages-container {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(203, 213, 225, 0.4) transparent;
                }
                .sidebar-scrollable::-webkit-scrollbar, .messages-container::-webkit-scrollbar {
                    width: 6px;
                }
                .sidebar-scrollable::-webkit-scrollbar-track, .messages-container::-webkit-scrollbar-track {
                    background: transparent;
                }
                .sidebar-scrollable::-webkit-scrollbar-thumb, .messages-container::-webkit-scrollbar-thumb {
                    background-color: rgba(203, 213, 225, 0.4);
                    border-radius: 10px;
                }
                .sidebar-scrollable:hover::-webkit-scrollbar-thumb, .messages-container:hover::-webkit-scrollbar-thumb {
                    background-color: rgba(148, 163, 184, 0.6);
                }

                /* ====== MOBILE REDESIGN ====== */
                @media (max-width: 768px) {
                    .agent-container {
                        height: 100dvh !important;
                        border-radius: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                        max-width: none !important;
                        width: 100% !important;
                        flex: 1 !important;
                        background: #f8fafc !important;
                    }
                    /* --- Header glassmorphism --- */
                    .mobile-chat-header {
                        background: rgba(255,255,255,0.82) !important;
                        backdrop-filter: blur(20px) saturate(180%) !important;
                        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
                        border-bottom: 1px solid rgba(226,232,240,0.6) !important;
                        padding: 0.7rem 1rem !important;
                        position: sticky !important;
                        top: 0 !important;
                        z-index: 20 !important;
                    }
                    .agent-header-title {
                        font-size: 1.1rem !important;
                        font-weight: 700 !important;
                        letter-spacing: -0.03em !important;
                    }
                    /* --- Messages area --- */
                    .messages-container {
                        padding: 0.5rem 0.85rem 0.5rem 0.85rem !important;
                        background: #f8fafc !important;
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                    .messages-container::-webkit-scrollbar { display: none; }
                    /* --- User bubble --- */
                    .msg-bubble-user {
                        background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%) !important;
                        border: none !important;
                        border-radius: 1.25rem 1.25rem 0.3rem 1.25rem !important;
                        padding: 0.8rem 1.1rem !important;
                        box-shadow: 0 2px 8px rgba(79,70,229,0.08) !important;
                        max-width: 82% !important;
                        font-size: 0.93rem !important;
                    }
                    /* --- Bot bubble --- */
                    .msg-bubble-bot {
                        background: transparent !important;
                        border-left: 3px solid rgba(79,70,229,0.25) !important;
                        border-radius: 0 !important;
                        padding: 0.6rem 0 0.6rem 0.9rem !important;
                        font-size: 0.93rem !important;
                    }
                    /* --- Bot avatar --- */
                    .bot-avatar-mobile {
                        background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%) !important;
                        box-shadow: 0 2px 12px rgba(79,70,229,0.3) !important;
                        width: 28px !important; height: 28px !important;
                        font-size: 0.95rem !important;
                    }
                    /* --- Input bar floating --- */
                    .input-wrapper {
                        position: relative !important;
                        bottom: auto !important;
                        padding: 0.8rem 1.25rem calc(2.5rem + env(safe-area-inset-bottom)) 1.25rem !important;
                        background: rgba(255,255,255,0.92) !important;
                        backdrop-filter: blur(20px) !important;
                        -webkit-backdrop-filter: blur(20px) !important;
                        border-top: none !important;
                        box-shadow: 0 -4px 30px rgba(0,0,0,0.06) !important;
                        transition: padding-bottom 0.2s ease-out !important;
                        border-radius: 0 !important;
                    }
                    .input-wrapper:focus-within {
                        padding-bottom: 0.8rem !important;
                    }
                    /* --- Welcome screen --- */
                    .welcome-heading {
                        font-size: 1.6rem !important;
                    }
                    .welcome-sub {
                        font-size: 1.8rem !important;
                        background: linear-gradient(135deg, #64748b 0%, #94a3b8 50%, #4F46E5 100%) !important;
                        -webkit-background-clip: text !important;
                        -webkit-text-fill-color: transparent !important;
                        background-clip: text !important;
                    }
                    .empty-state-pills {
                        display: grid !important;
                        grid-template-columns: 1fr 1fr !important;
                        gap: 0.6rem !important;
                        width: 100% !important;
                    }
                    .suggestion-pill {
                        width: 100% !important;
                        padding: 0.85rem 0.75rem !important;
                        border-radius: 1rem !important;
                        font-size: 0.85rem !important;
                        flex-direction: column !important;
                        gap: 0.35rem !important;
                        text-align: center !important;
                        background: #ffffff !important;
                        border: 1px solid #e2e8f0 !important;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
                        transition: transform 0.15s ease, box-shadow 0.15s ease !important;
                    }
                    .suggestion-pill:active {
                        transform: scale(0.97) !important;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.08) !important;
                    }
                    .suggestion-pill-icon {
                        font-size: 1.5rem !important;
                    }
                    /* --- Loading typing dots --- */
                    .typing-dots-container {
                        display: flex !important;
                        gap: 0.3rem;
                        align-items: center;
                        padding: 0.5rem 0;
                    }
                    .typing-dot {
                        width: 8px; height: 8px;
                        border-radius: 50%;
                        background: #94a3b8;
                    }
                    .loading-text-desktop {
                        display: none !important;
                    }
                    /* --- Sidebar --- */
                    .agent-sidebar {
                        position: absolute;
                        top: 0; left: 0; height: 100%;
                        z-index: 30;
                        box-shadow: 4px 0 24px rgba(0,0,0,0.12);
                        border-radius: 0;
                    }
                    .sidebar-overlay {
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.5);
                        z-index: 25;
                        backdrop-filter: blur(3px);
                        -webkit-backdrop-filter: blur(3px);
                    }
                }
                @media (min-width: 769px) {
                    .sidebar-overlay { display: none; }
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
                    .nav-menu-wrapper {
                        display: none !important;
                    }
                }
            `}</style>
        </DashboardLayout>
    );
};
export default AgentPage;
