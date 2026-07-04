import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X, Send, HelpCircle, Mail } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import LazyMarkdown from '../common/LazyMarkdown';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { SUPPORT_EMAIL } from './moreInfoLinks';
import { safeJSONParse } from '../../utils/safeJSONParse';
import styles from './HelpChatWidget.module.css';

/* [P2-HELP-CHATBOT · 2026-07-04] Chatbot de ayuda del ítem "Obtener ayuda"
   (menú de cuenta desktop + menú "más" móvil). Responde dudas de PRODUCTO
   (qué es MealfitRD, planes/precios, cómo usar cada sección) vía
   POST /api/help/chat — un bot sin acceso a datos del usuario; para "mi plan"
   redirige al Agente. Escalación humana: correo de soporte en el pie.

   - Historial client-held en sessionStorage (sobrevive navegación dentro de
     la pestaña; muere al cerrarla — soporte no es memoria a largo plazo).
   - Chunk lazy: DashboardLayout lo importa con React.lazy → no pesa en el
     bundle inicial del dashboard. */

const STORAGE_KEY = 'mealfit_help_chat_msgs_v1';
const MAX_STORED = 30;   // mensajes persistidos (UI)
const MAX_SENT = 12;     // mensajes enviados al backend (espejo del knob MAX_TURNS)
const MAX_INPUT = 1500;  // espejo del knob MEALFIT_HELP_CHAT_MAX_CHARS

const GREETING = {
    role: 'assistant',
    content: '¡Hola! Soy el asistente de MealfitRD. Pregúntame lo que quieras sobre la app: cómo funciona, planes y precios, la Nevera, las recetas, tu cuenta…',
};

const SUGGESTIONS = [
    '¿Qué incluye cada plan y cuánto cuesta?',
    '¿Cómo genero mi plan de comidas?',
    '¿Para qué sirve la Nevera?',
];

const ERROR_FALLBACK = 'No pude responder ahora mismo. Intenta de nuevo en un momento o escríbenos por correo (abajo) y te ayudamos.';
const RATE_LIMIT_MSG = 'Vamos muy rápido 😅 — espera unos segundos y vuelve a preguntar.';

const loadStoredMessages = () => {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? safeJSONParse(raw, null) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return [GREETING];
};

export default function HelpChatWidget({ onClose }) {
    const [messages, setMessages] = useState(loadStoredMessages);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose });

    // Persistir historial (acotado) + autoscroll al fondo en cada mensaje.
    useEffect(() => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
        } catch { /* storage lleno/bloqueado → el chat sigue en memoria */ }
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages, isLoading]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const sendMessage = useCallback(async (text) => {
        const clean = (text ?? '').trim().slice(0, MAX_INPUT);
        if (!clean || isLoading) return;
        setInput('');
        setIsLoading(true);
        const history = [...messages, { role: 'user', content: clean }];
        setMessages(history);
        try {
            const res = await fetchWithAuth('/api/help/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // Solo la cola reciente; el backend igual recorta (MAX_TURNS).
                    messages: history.slice(-MAX_SENT).map(({ role, content }) => ({ role, content })),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: reply || ERROR_FALLBACK,
                    isError: !reply,
                }]);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: res.status === 429 ? RATE_LIMIT_MSG : ERROR_FALLBACK,
                    isError: res.status !== 429,
                }]);
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: ERROR_FALLBACK, isError: true }]);
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    }, [messages, isLoading]);

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage(input);
    };

    // Chips solo en el estado inicial (nada preguntado aún).
    const showSuggestions = !isLoading && messages.filter(m => m.role === 'user').length === 0;

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <section
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label="Asistente de ayuda de MealfitRD"
                ref={containerRef}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
            >
                <header className={styles.header}>
                    <span className={styles.headerIcon} aria-hidden="true">
                        <HelpCircle size={17} strokeWidth={2.2} />
                    </span>
                    <div className={styles.headerText}>
                        <span className={styles.headerTitle}>Obtener ayuda</span>
                        <span className={styles.headerSub}>Asistente de MealfitRD</span>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar ayuda">
                        <X size={17} strokeWidth={2.4} />
                    </button>
                </header>

                <div className={styles.messages} ref={listRef} aria-live="polite">
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`${styles.bubble} ${msg.role === 'user' ? styles.bubbleUser : styles.bubbleBot} ${msg.isError ? styles.bubbleError : ''}`}
                        >
                            {msg.role === 'assistant'
                                ? <div className="markdown-chat"><LazyMarkdown>{msg.content}</LazyMarkdown></div>
                                : msg.content}
                        </div>
                    ))}
                    {isLoading && (
                        <div className={`${styles.bubble} ${styles.bubbleBot} ${styles.typing}`} aria-label="El asistente está escribiendo">
                            <span /><span /><span />
                        </div>
                    )}
                    {showSuggestions && (
                        <div className={styles.suggestions}>
                            {SUGGESTIONS.map((s) => (
                                <button key={s} type="button" className={styles.suggestionChip} onClick={() => sendMessage(s)}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <form className={styles.inputRow} onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        className={styles.input}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Escribe tu duda…"
                        maxLength={MAX_INPUT}
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        className={styles.sendBtn}
                        disabled={isLoading || !input.trim()}
                        aria-label="Enviar pregunta"
                    >
                        <Send size={16} strokeWidth={2.3} />
                    </button>
                </form>

                <footer className={styles.footer}>
                    <Mail size={13} strokeWidth={2.25} aria-hidden="true" />
                    <span>
                        ¿Prefieres correo?{' '}
                        <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.footerLink}>{SUPPORT_EMAIL}</a>
                    </span>
                </footer>
            </section>
        </div>,
        document.body
    );
}

HelpChatWidget.propTypes = {
    onClose: PropTypes.func.isRequired,
};
