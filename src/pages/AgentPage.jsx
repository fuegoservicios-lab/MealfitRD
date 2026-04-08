import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssessment } from '../context/AssessmentContext';
import { Send, Bot, Loader2, Paperclip, X, Image as ImageIcon, Plus, MessageSquare, History, Menu, Apple, Dumbbell, Utensils, Camera, Sparkles, Lock, Trash2, Check, Mic, ArrowUp, Square, ThumbsUp, ThumbsDown, RefreshCw, Copy, MoreVertical, LayoutDashboard, ShoppingBag, Clock, Settings, Edit2, Ghost } from 'lucide-react';
import { fetchWithAuth } from '../config/api';
import ReactMarkdown from 'react-markdown';
import { MemoizedMessageBubble } from '../components/agent/MessageBubble';
import { SidebarRecientes } from '../components/agent/SidebarRecientes';
const generateIntelligentWelcome = (userProfile, formData, planData) => {
    const nameStr = formData?.name || userProfile?.name || userProfile?.first_name || '';
    const nameParts = nameStr.split(' ');
    const firstName = nameParts[0] ? ' ' + nameParts[0] : '';
    
    const now = new Date();
    const hour = now.getHours();
    
    let timeGreeting = '¡Hola';
    let mealContext = '';
    
    // Cycle and exact meal logic safely
    let rawStartDate = planData?.grocery_start_date || planData?.created_at;
    let cycleDayNum = 1;
    let exactMealName = '';
    let isPlanExpired = false;

    if (planData && rawStartDate) {
        // iOS Safari Safe Date Parsing replacing space with T
        const safeDateStr = typeof rawStartDate === 'string' ? rawStartDate.replace(' ', 'T') : rawStartDate;
        const startMidnight = new Date(safeDateStr);
        
        if (!isNaN(startMidnight.getTime())) {
            startMidnight.setHours(0, 0, 0, 0);
            const todayMidnight = new Date();
            todayMidnight.setHours(0, 0, 0, 0);
            const diff = Math.round((todayMidnight - startMidnight) / (1000 * 60 * 60 * 24));
            
            const groceryDuration = formData?.groceryDuration || 'weekly';
            let maxDays = 7;
            if (groceryDuration === 'weekly') maxDays = 7;
            else if (groceryDuration === 'biweekly') maxDays = 15;
            else if (groceryDuration === 'monthly') maxDays = 30;
            
            if (diff >= maxDays) isPlanExpired = true;
            cycleDayNum = Math.min(Math.max(1, diff + 1), maxDays);
        }
    }

    // Explicit logical meal intervals
    let mealKeyword = '';
    if (hour >= 4 && hour < 11) mealKeyword = 'desayuno';
    else if (hour >= 11 && hour < 12) mealKeyword = 'snack';
    else if (hour >= 12 && hour < 15) mealKeyword = 'almuerzo';
    else if (hour >= 15 && hour < 19) mealKeyword = 'snack';
    else mealKeyword = 'cena';

    if (planData && !isPlanExpired) {
        const planDays = planData?.days || [{ day: 1, meals: planData?.meals || planData?.perfectDay || [] }];
        if (planDays.length > 0 && !isNaN(cycleDayNum)) {
            const activeDayIndex = (cycleDayNum - 1) % planDays.length;
            const currentDayMeals = planDays[activeDayIndex]?.meals || [];
            
            // Search by m.meal field (type: "Desayuno") NOT by m.name (dish: "Mangú con Huevo")
            let exactMeal = null;
            if (mealKeyword === 'desayuno') {
                exactMeal = currentDayMeals.find(m => m?.meal?.toLowerCase().includes('desayuno'));
            } else if (mealKeyword === 'almuerzo') {
                exactMeal = currentDayMeals.find(m => m?.meal?.toLowerCase().includes('almuerzo'));
            } else if (mealKeyword === 'cena') {
                exactMeal = currentDayMeals.find(m => m?.meal?.toLowerCase().includes('cena'));
            } else {
                exactMeal = currentDayMeals.find(m => m?.meal?.toLowerCase().includes('snack') || m?.meal?.toLowerCase().includes('merienda'));
            }
            
            if (exactMeal && exactMeal.name) {
                exactMealName = exactMeal.name.trim();
            }
        }
    }
    
    if (mealKeyword === 'desayuno') {
        timeGreeting = '¡Buenos días';
        mealContext = exactMealName 
            ? `Según tu plan, hoy te toca **${exactMealName}** de desayuno, ¿tienes los ingredientes listos o armamos una alternativa rápida?` 
            : '¿Listo para tu desayuno o necesitas una idea rápida?';
    } else if (mealKeyword === 'almuerzo') {
        timeGreeting = hour < 12 ? '¡Buenos días' : '¡Buenas tardes';
        mealContext = exactMealName 
            ? `Hoy de almuerzo tienes marcado **${exactMealName}**. ¿Ya lo preparaste o necesitas cambiar algo con los ingredientes que tienes?` 
            : '¿Preparando ya el almuerzo o necesitas una receta rápida?';
    } else if (mealKeyword === 'cena') {
        timeGreeting = hour < 18 ? '¡Buenas tardes' : '¡Buenas noches';
        mealContext = exactMealName 
            ? `De cena para hoy tienes: **${exactMealName}**. ¿Quieres que te pase las instrucciones paso a paso o prefieres otra cosa?` 
            : '¿Buscando algo ligero antes de dormir o tu cena?';
    } else {
        // snack
        timeGreeting = hour < 12 ? '¡Buenos días' : (hour < 18 ? '¡Buenas tardes' : '¡Buenas noches');
        mealContext = exactMealName 
            ? `Es hora de tu snack o merienda: **${exactMealName}**. Si no lo tienes, dime qué hay en tu refri y lo resolvemos.` 
            : '¿Necesitas un buen snack para calmar el hambre?';
    }

    let goalContext = '';
    // Schema field is "main_goal", with fallbacks for legacy data
    const goalField = planData?.main_goal || planData?.goal || planData?.objective || '';
    if (goalField) {
        const lowerGoal = goalField.toLowerCase();
        let goalText = '';
        if (lowerGoal.includes('pérdida') || lowerGoal.includes('peso') || lowerGoal.includes('déficit') || lowerGoal.includes('bajar')) goalText = 'bajar de peso';
        else if (lowerGoal.includes('músculo') || lowerGoal.includes('masa') || lowerGoal.includes('ganar')) goalText = 'ganar masa muscular';
        else if (lowerGoal.includes('mantenimiento') || lowerGoal.includes('mantener')) goalText = 'mantenerte en forma';
        else if (lowerGoal.includes('recomp')) goalText = 'recomponer tu cuerpo';
        
        if (goalText) {
            goalContext = `Seguimos enfocados en tu meta de ${goalText}. `;
        }
    }

    const timeStr = now.toLocaleTimeString('es-DO', {hour: '2-digit', minute: '2-digit', hour12: true});
    return `${timeGreeting}${firstName}! Son las ${timeStr}. ${goalContext}${mealContext}`;
};

const compressImageFile = (file, maxWidth = 1200, quality = 0.8) => {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        resolve(file); // fallback
                        return;
                    }
                    const newFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                    resolve(newFile);
                },
                'image/jpeg',
                quality
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file); // fallback
        };
    });
};

const AgentPage = () => {
    const { session, planData, formData, updateData, saveGeneratedPlan, userProfile, isPlus, checkPlanLimit } = useAssessment();
    const navigate = useNavigate();
    const [titlePollCount, setTitlePollCount] = useState(0);
    const [showNavMenu, setShowNavMenu] = useState(false);
    const navMenuRef = useRef(null);

    // IsMobile detection para asegurar sobrescritura inline a prueba de fallos de iOS
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 1024 : false);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
        const newId = crypto.randomUUID();
        localStorage.setItem('mealfit_current_session', newId);
        return newId;
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
                setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true }]);
                setChatSessions([]);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id, userProfile?.id]);

    const [chatSessions, setChatSessions] = useState([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [showSidebar, setShowSidebar] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 768 : true);

    const [messages, setMessages] = useState([
        { role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true }
    ]);
    const messagesRef = useRef(messages);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Re-generate welcome when planData/formData become available (they load async)
    const hasHydratedWelcome = useRef(false);
    useEffect(() => {
        if (hasHydratedWelcome.current) return;
        // Only regenerate if we actually have plan data now AND the current messages are just the initial welcome
        if ((planData || formData?.name) && messages.length === 1 && messages[0]?.isWelcome) {
            hasHydratedWelcome.current = true;
            setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true }]);
        }
    }, [planData, formData, userProfile]);
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
    
    // Para Drag & Drop de Imágenes
    const [isDragging, setIsDragging] = useState(false);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading]);

    const processSelectedFile = async (file) => {
        if (!file.type.startsWith('image/')) {
            alert('Formato no soportado. Por favor sube una imagen válida.');
            return;
        }
        
        // Generar preview local INMEDIATAMENTE para anular percepción de lag
        setPreviewUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
        
        // Guardar original temporalmente
        setSelectedFile(file);
        
        try {
            // Comprimir imagen asincrónicamente
            const compressedFile = await compressImageFile(file);
            setSelectedFile(compressedFile);
        } catch (err) {
            console.error("No se pudo comprimir la imagen:", err);
            // Si falla, el archivo original ya quedó configurado como fallback
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            processSelectedFile(file);
        }
    };

    const clearSelectedFile = () => {
        setPreviewUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
        setSelectedFile(null);
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
                    processSelectedFile(file);
                }
                break;
            }
        }
    };

    // --- Drag and Drop Handlers ---
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            processSelectedFile(file);
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
                    // Filtrar los mensajes de sistema/bienvenida: detectar por flag o por patrones conocidos
                    const filteredMessages = data.messages.filter(m => {
                        if (!m.content) return false;
                        // Filtrar mensajes de bienvenida viejos y nuevos por patrones estables (no time-dependent)
                        if (m.content === '¡Hola! Soy tu agente conversacional de nutrición IA. ¿En qué te puedo ayudar con tu plan alimenticio de hoy?') return false;
                        if (m.role === 'model' && m.content.includes('Son las ') && (m.content.includes('de tu súper)') || m.content.includes('especialista para guiarte') || m.content.includes('enfocados en tu meta'))) return false;
                        return true;
                    });
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
                    setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true }]);
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
                setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true }]);
            } else {
                setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true }]);
            }
        } catch (error) {
            console.error("Error fetching session messages:", error);
            if (retryCount < 2) {
                setTimeout(() => fetchSessionMessages(sessionId, retryCount + 1), 600);
                return;
            }
            setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true }]);
        } finally {
            if (retryCount >= 2 || (response && response.ok)) {
                setIsLoadingHistory(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setMessages, setIsLoadingHistory, userProfile, formData, planData]);

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
        setMessages([{ role: 'model', content: generateIntelligentWelcome(userProfile, formData, planData), isWelcome: true }]);
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
                    try { errData = await response.json(); } catch(error){}
                    setMessages(prev => [...prev, { role: 'model', content: `❌ Error al comunicarse con la IA: ${errData.detail || ''}` }]);
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {

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

            abortController.abort();
            setAbortController(null);
            setIsLoading(false);
            setStreamingStatus(null);
        }
    };

    const handleRegenerate = (modelMsgIndex) => {
        // Find the last user message before this model message
        const lastUserMsg = messagesRef.current.slice(0, modelMsgIndex).reverse().find(m => m.role === 'user');
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
                                border: '1px solid #e2e8f0',
                                animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}>
                                <img src={previewUrl} alt="Preview" style={{ width: '48px', height: '48px', borderRadius: '6px', opacity: isLoading ? 0.5 : 1, objectFit: 'cover' }} />
                                <button
                                    type="button"
                                    aria-label="Quitar imagen"
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
                            accept="image/png, image/jpeg, image/jpg, image/webp, image/heic"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />

                        <button
                            type="button"
                            aria-label="Adjuntar imagen"
                            className={`attachment-btn ${isLoading ? 'disabled' : ''}`}
                            disabled={isLoading}
                            onClick={() => {
                                if (fileInputRef.current) {
                                    fileInputRef.current.value = '';
                                    fileInputRef.current.click();
                                }
                            }}
                            title="Adjuntar imagen"
                        >
                            <Paperclip size={20} strokeWidth={2} />
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
                                type="button"
                                aria-label="Detener generación"
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
                        ) : (
                            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
                                {(!input.trim() || isListening) && (
                                    <button
                                        type="button"
                                        aria-label="Dictado por voz"
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
                                            flexShrink: 0
                                        }}
                                        title="Dictado por voz"
                                    >
                                        <Mic size={20} className={isListening ? "pulse-anim-mic" : ""} />
                                    </button>
                                )}
                                {(input.trim() || selectedFile) && (
                                    <button
                                        type="button"
                                        aria-label="Enviar"
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
                                            marginRight: '2px'
                                        }}
                                    >
                                        <ArrowUp size={22} strokeWidth={2.5} />
                                    </button>
                                )}
                            </div>
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
        <>
            <style>{`
                .chat-session-btn .chat-actions-hover {
                    opacity: 0;
                    pointer-events: none;
                }
                .chat-session-btn:hover .chat-actions-hover {
                    opacity: 1;
                    pointer-events: auto;
                }

                .attachment-btn {
                    background: transparent;
                    color: #64748b;
                    border: none;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
                    flex-shrink: 0;
                    outline: none;
                    -webkit-tap-highlight-color: transparent;
                }
                .attachment-btn:not(.disabled):hover {
                    color: #3b82f6;
                    background: #f1f5f9;
                }
                .attachment-btn:not(.disabled):active {
                    transform: scale(0.85);
                    background: #e2e8f0;
                }
                .attachment-btn.disabled {
                    opacity: 0.5;
                    cursor: default;
                }
            `}</style>
            <div className="agent-container" 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                display: 'flex',
                flexDirection: 'row',
                height: isMobile ? '100dvh' : 'calc(100dvh - 4rem)',
                background: '#ffffff',
                borderRadius: isMobile ? '0' : '1.5rem',
                boxShadow: isMobile ? 'none' : '0 10px 40px -10px rgba(0,0,0,0.08)',
                border: isMobile ? 'none' : '1px solid rgba(226, 232, 240, 0.8)',
                overflow: 'hidden',
                margin: isMobile ? '0' : '0 auto',
                maxWidth: isMobile ? '100vw' : '1200px',
                width: '100%',
                position: 'relative'
            }}>
                {/* Overlay Drag & Drop */}
                {isDragging && (
                    <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(255, 255, 255, 0.85)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '4px dashed #3b82f6',
                        borderRadius: isMobile ? '0' : '1.5rem',
                        transition: 'all 0.2s ease',
                        pointerEvents: 'none'
                    }}>
                        <div style={{
                            background: 'white',
                            padding: '2rem 3rem',
                            borderRadius: '1.25rem',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '1rem',
                            animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                        }}>
                            <ImageIcon size={48} color="#3b82f6" strokeWidth={1.5} />
                            <h2 style={{ margin: 0, color: '#1e293b', fontSize: '1.5rem', fontWeight: 600 }}>
                                Suelta tu imagen aquí
                            </h2>
                            <p style={{ margin: 0, color: '#64748b' }}>
                                La subiremos optimizada para responderte.
                            </p>
                        </div>
                    </div>
                )}
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
                <SidebarRecientes
                    showSidebar={showSidebar}
                    setShowSidebar={setShowSidebar}
                    handleNewChat={handleNewChat}
                    isLoadingSessions={isLoadingSessions}
                    chatSessions={chatSessions}
                    groupedSessions={groupedSessions}
                    currentSessionId={currentSessionId}
                    setCurrentSessionId={setCurrentSessionId}
                    handleDeleteChat={handleDeleteChat}
                    isLoading={isLoading}
                />

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
                            <Menu size={24} strokeWidth={2} />
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
                                    <MemoizedMessageBubble 
                                        key={i} 
                                        msg={msg} 
                                        index={i} 
                                        currentSessionId={currentSessionId} 
                                        onRegenerate={handleRegenerate} 
                                    />
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
                @media (max-width: 1024px) {
                    .agent-container {
                        height: 100dvh !important;
                        border-radius: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                        max-width: none !important;
                        width: 100% !important;
                        flex: 1 !important;
                        background: #ffffff !important;
                    }
                    /* --- Header glassmorphism --- */
                    .mobile-chat-header {
                        background: rgba(255,255,255,0.85) !important;
                        backdrop-filter: blur(20px) saturate(180%) !important;
                        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
                        border-bottom: 1px solid rgba(226,232,240,0.6) !important;
                        padding: 0.75rem 1.25rem !important;
                        padding-top: calc(0.75rem + max(env(safe-area-inset-top), 24px)) !important;
                        position: sticky !important;
                        top: 0 !important;
                        z-index: 20 !important;
                    }
                    /* --- Sidebar top safe-area --- */
                    .sidebar-header-padding {
                        padding-top: calc(1.25rem + max(env(safe-area-inset-top), 24px)) !important;
                    }
                    .agent-header-title {
                        font-size: 1.1rem !important;
                        font-weight: 700 !important;
                        letter-spacing: -0.03em !important;
                    }
                    /* --- Messages area --- */
                    .messages-container {
                        padding: 1rem 1rem 1rem 1rem !important;
                        background: #ffffff !important;
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
                        max-width: 85% !important;
                        font-size: 0.95rem !important;
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
                @media (min-width: 1025px) {
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
        </>
    );
};
export default AgentPage;
