import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X, Send, HelpCircle, Mail } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import LazyMarkdown from '../common/LazyMarkdown';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { SUPPORT_EMAIL } from './moreInfoLinks';
import { isTrackingMode, neveraActiva } from '../../config/dashboardNav';
import { nativeHidesCommerce } from '../../config/platform';
import { medirTecladoDeVentana } from '../../utils/keyboardViewport';
import { safeJSONParse } from '../../utils/safeJSONParse';
import { useT, getLocale } from '../../i18n';
import styles from './HelpChatWidget.module.css';

// [P3-I18N-MARCA-HORNEADA-EN-26-CLAVES] la marca entra como variable, no horneada en la clave.
import { BRAND } from '../../data/routeMeta';
/* [P2-HELP-CHATBOT · 2026-07-04] Chatbot de ayuda del ítem "Obtener ayuda"
   (menú de cuenta desktop + menú "más" móvil). Responde dudas de PRODUCTO
   (qué es Bioboros, planes/precios, cómo usar cada sección) vía
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

// [P1-I18N-DASHBOARD · 2026-08-15] Funciones y no constantes: un `t()` en ámbito
// de módulo se evalúa al importar, antes de que el catálogo exista.
// [P1-HELP-BOT-NATIVE-NO-COMMERCE · 2026-08-22] En la app nativa el bot no presenta
// «planes y precios» ni los sugiere (Apple 3.1.1): la directiva real va en el backend
// (`hide_commerce`), esto es la cara visible.
const getGreeting = (t) => ({
    role: 'assistant',
    content: nativeHidesCommerce()
        ? t('¡Hola! Soy el asistente de {app}. Pregúntame lo que quieras sobre la app: cómo funciona, la Nevera, las recetas, tu cuenta…', { app: BRAND })
        : t('¡Hola! Soy el asistente de {app}. Pregúntame lo que quieras sobre la app: cómo funciona, planes y precios, la Nevera, las recetas, tu cuenta…', { app: BRAND }),
});

// Cuerpo con llaves: el validador mide el ámbito contando llaves y una flecha que
// devuelve un array pelado dejaría estos `t()` a profundidad 0.
// [P1-PLAN-LOTE-137 · 2026-09-20] `contador`: con el generador apagado no hay plato del día que cambiar; la pregunta
// útil ahí es cómo se anota una comida. «¿Cómo genero mi plan…?» se queda: es justo cómo se enciende.
// [P1-NEVERA-OPCIONAL · 2026-09-23] `nevera`: con la Nevera apagada, «¿Para qué sirve la Nevera?» no tiene
// respuesta útil — la pantalla ni existe. NO exportada (evita el warning `react-refresh/only-export-components`
// de un archivo mixto componente+helper); se prueba por fuente, igual que el resto de este archivo.
const getSuggestions = (t, contador = false, nevera = true) => {
    const base = [
        t('¿Cómo genero mi plan de comidas?'),
        ...(nevera ? [t('¿Para qué sirve la Nevera?')] : []),
    ];
    if (contador) return [t('¿Cómo registro lo que como?'), ...base];
    if (nativeHidesCommerce()) return [t('¿Cómo cambio un plato del día?'), ...base];
    return [t('¿Qué incluye cada plan y cuánto cuesta?'), ...base];
};

const loadStoredMessages = (t) => {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? safeJSONParse(raw, null) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return [getGreeting(t)];
};

export default function HelpChatWidget({ onClose }) {
    const t = useT();
    const [messages, setMessages] = useState(() => loadStoredMessages(t));
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    // [P2-CHAT-FRONT-AUDIT · 2026-09-14] Candado SÍNCRONO (ref), como el del coach
    // (P1-CHAT-TURN-ACTIVE): el `isLoading` de React no cambia hasta el siguiente render,
    // así que un doble toque dentro del mismo frame enviaba la pregunta dos veces.
    const sendingRef = useRef(false);
    // Petición en vuelo: se aborta al cerrar el panel (antes seguía viva y hacía
    // setState sobre un componente desmontado).
    const abortRef = useRef(null);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            try { abortRef.current?.abort(); } catch { /* ya cerrada */ }
            abortRef.current = null;
        };
    }, []);
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose });

    // [P1-HELP-BOT-KEYBOARD · 2026-08-22] En móvil la hoja es fixed a 100dvh y el teclado
    // de iOS NO encoge el layout viewport: el campo de texto quedaba DEBAJO del teclado.
    // Mismo patrón que la hoja de la Nevera: seguir al visualViewport (alto + offset).
    const [vvBox, setVvBox] = useState(null);
    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!vv) return undefined;
        const mobile = () => window.matchMedia('(max-width: 640px)').matches;
        const update = () => {
            if (!mobile()) { setVvBox(null); return; }
            // [P1-KB-VIEWPORT-MATH · 2026-08-23] El predicado no puede restar el paneo de
            // iOS (SSOT en utils/keyboardViewport.js). Aquí el panel SÍ sigue al visual
            // viewport, así que la longitud que usa es vv.height/offsetTop directos.
            const { abierto } = medirTecladoDeVentana(window);
            setVvBox(abierto ? { top: Math.round(vv.offsetTop), height: Math.round(vv.height) } : null);
        };
        update();
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
    }, []);

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
        const errorFallback = t('No pude responder ahora mismo. Intenta de nuevo en un momento o escríbenos por correo (abajo) y te ayudamos.');
        const rateLimitMsg = t('Vamos muy rápido 😅 — espera unos segundos y vuelve a preguntar.');
        const clean = (text ?? '').trim().slice(0, MAX_INPUT);
        if (!clean || sendingRef.current) return;
        sendingRef.current = true;
        const controller = new AbortController();
        abortRef.current = controller;
        setInput('');
        setIsLoading(true);
        const history = [...messages, { role: 'user', content: clean }];
        setMessages(history);
        try {
            const res = await fetchWithAuth('/api/help/chat', {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // Solo la cola reciente; el backend igual recorta (MAX_TURNS).
                    messages: history.slice(-MAX_SENT).map(({ role, content }) => ({ role, content })),
                    // [P1-HELP-BOT-I18N · 2026-08-20] Sin esto el bot contesta SIEMPRE en
                    // español: la regla 5 de su prompt se lo ordena. El backend valida
                    // contra su lista y cae a es-DO si no lo reconoce.
                    locale: getLocale(),
                    // [P1-HELP-BOT-NATIVE-NO-COMMERCE] en nativo el backend no cita precios.
                    hide_commerce: nativeHidesCommerce(),
                }),
            });
            if (!mountedRef.current) return;
            if (res.ok) {
                const data = await res.json();
                if (!mountedRef.current) return;
                const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: reply || errorFallback,
                    isError: !reply,
                }]);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: res.status === 429 ? rateLimitMsg : errorFallback,
                    isError: res.status !== 429,
                }]);
            }
        } catch (error) {
            // Panel cerrado (abort) o desmontado: nada que pintar.
            if (error?.name === 'AbortError' || !mountedRef.current) return;
            setMessages(prev => [...prev, { role: 'assistant', content: errorFallback, isError: true }]);
        } finally {
            sendingRef.current = false;
            if (abortRef.current === controller) abortRef.current = null;
            if (mountedRef.current) {
                setIsLoading(false);
                inputRef.current?.focus();
            }
        }
    }, [messages, t]);

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
                style={vvBox ? { top: vvBox.top, bottom: 'auto', height: vvBox.height } : undefined}
                role="dialog"
                aria-modal="true"
                aria-label={t('Asistente de ayuda de {app}', { app: BRAND })}
                ref={containerRef}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
            >
                <header className={styles.header}>
                    <span className={styles.headerIcon} aria-hidden="true">
                        <HelpCircle size={17} strokeWidth={2.2} />
                    </span>
                    <div className={styles.headerText}>
                        <span className={styles.headerTitle}>{t('Obtener ayuda')}</span>
                        <span className={styles.headerSub}>{t('Asistente de {app}', { app: BRAND })}</span>
                    </div>
                    <button type="button" className={`${styles.closeBtn} ui-close`} onClick={onClose} aria-label={t('Cerrar ayuda')}>
                        <X size={20} strokeWidth={2.25} aria-hidden="true" />
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
                        <div className={`${styles.bubble} ${styles.bubbleBot} ${styles.typing}`} aria-label={t('El asistente está escribiendo')}>
                            <span /><span /><span />
                        </div>
                    )}
                    {showSuggestions && (
                        <div className={styles.suggestions}>
                            {getSuggestions(t, isTrackingMode(null), neveraActiva(null)).map((s) => (
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
                        placeholder={t('Escribe tu duda…')}
                        maxLength={MAX_INPUT}
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        className={styles.sendBtn}
                        disabled={isLoading || !input.trim()}
                        aria-label={t('Enviar pregunta')}
                    >
                        <Send size={16} strokeWidth={2.3} />
                    </button>
                </form>

                <footer className={styles.footer}>
                    <Mail size={13} strokeWidth={2.25} aria-hidden="true" />
                    <span>
                        {t('¿Prefieres correo?')}{' '}
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
