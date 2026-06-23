import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bell, BellOff, X, Trash2, CheckCheck, FlaskConical, AlertTriangle, Info,
    ChevronDown, MessageCircle, Pill, ArrowDown, ArrowUp, ArrowRight, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    getNotifications,
    removeNotification,
    clearNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    dedupeNotifications,
    NOTIFICATIONS_EVENT,
    NOTIFICATIONS_OPEN_EVENT,
} from '../../utils/notifications';
// [P3-NOTIF-CENTER · 2026-06-16] Mismo hook a11y SSOT que el resto de modales
// custom (focus-trap + ESC + lock de scroll + restore-focus). SSR-safe.
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useAssessment } from '../../context/AssessmentContext';
import { requestAgentPrefill } from '../../utils/agentPrefill';
// classify = SSOT del cálculo de las mini-barras (mismo que el panel de micros).
// restoreMicrosPanel = "desocultar" el panel desde aquí (P3-MICROS-RESTORE).
import { classify, restoreMicrosPanel } from './MicronutrientPanel';
import styles from './NotificationCenter.module.css';

/* [P3-NOTIF-CENTER · 2026-06-16] Centro de notificaciones del dashboard.

   Qué resuelve: los avisos descartables (micronutrientes a vigilar, "plan no
   óptimo", etc.) antes desaparecían para siempre al darles la "X". Ahora su X
   los ARCHIVA en este centro — un tirador-pestaña fijo en el borde derecho
   (PC) / más pequeño en móvil — desde donde el usuario los relee, los EXPANDE
   para ver la información completa + accionarla, y los borra con su propia X.

   Reactivo: se suscribe a NOTIFICATIONS_EVENT (mismo tab) + `storage`
   (cross-tab). Render via portal a <body> para escapar de cualquier
   stacking-context/overflow del layout. Leído/no-leído: el badge cuenta las no
   leídas; expandir una la marca leída. */

const KIND_META = {
    micros: { Icon: FlaskConical, tone: 'teal' },
    quality: { Icon: AlertTriangle, tone: 'amber' },
    warning: { Icon: AlertTriangle, tone: 'amber' },
    info: { Icon: Info, tone: 'indigo' },
};

function metaFor(n) {
    if (KIND_META[n.kind]) return KIND_META[n.kind];
    if (n.severity === 'warning') return KIND_META.warning;
    return KIND_META.info;
}

function relativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 0) return 'ahora';
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'ayer';
    if (d < 7) return `hace ${d} d`;
    const w = Math.floor(d / 7);
    return `hace ${w} sem`;
}

/* ----- vista expandida por tipo (información completa + acción) ----- */

function MicrosDetail({ data, onAction }) {
    // Array.isArray (no `|| []`): protege contra storage corrupto donde gaps sea
    // un objeto (truthy) → .map lanzaría.
    const gaps = Array.isArray(data?.gaps) ? data.gaps : [];
    const supplements = Array.isArray(data?.supplements) ? data.supplements : [];
    return (
        <>
            {gaps.length > 0 && (
                <div className={styles.exGaps}>
                    {/* [P3-MICRO-PLAIN-LANGUAGE · 2026-06-20] Mismo lenguaje claro que
                        el panel: chip BAJO/ALTO + frase ("Te faltan…/Te pasaste…"), no
                        barra. classify es el SSOT compartido. */}
                    {gaps.map((g, i) => {
                        const s = classify(g);
                        return (
                            <div key={`g-${i}`} className={styles.exGap}>
                                <div className={styles.exGapTop}>
                                    <span className={styles.exNutrient}>{g.nutriente}</span>
                                    <span className={`${styles.exPill} ${styles[`exTone_${s.tone}`]}`}>
                                        {s.kind === 'ceil'
                                            ? <ArrowUp size={10} strokeWidth={2.75} aria-hidden="true" />
                                            : <ArrowDown size={10} strokeWidth={2.75} aria-hidden="true" />}
                                        {s.statusWord}
                                    </span>
                                </div>
                                <p className={styles.exGapText}>
                                    {s.gapText} <span className={styles.exCur}>· tu plan aporta {g.valor}{g.unidad || ''}</span>
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {supplements.length > 0 && (
                <div className={styles.exSupps}>
                    <span className={styles.exLabel}>
                        Sugerencias
                    </span>
                    {supplements.map((it, i) => (
                        <div key={`s-${i}`} className={styles.exSupp}>
                            <Pill size={12} strokeWidth={2.25} aria-hidden="true" />
                            <span>
                                <strong>{it.nutriente}</strong> · {it.suplemento} {it.dosis_sugerida}
                                {it.primero_alimentos && (
                                    <span className={styles.exHint}> — primero alimentos: {it.primero_alimentos}</span>
                                )}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <button type="button" className={styles.exAction} onClick={onAction}>
                <MessageCircle size={14} strokeWidth={2.25} aria-hidden="true" />
                Preguntar al coach cómo mejorarlos
            </button>
        </>
    );
}

function QualityDetail({ data, onAction }) {
    return (
        <>
            {data?.reasonLabel && (
                <p className={styles.exReason}>
                    <strong>Motivo ({data.severityLabel}):</strong> {data.reasonLabel}
                </p>
            )}
            {data?.guidance && <p className={styles.exGuidance}>{data.guidance}</p>}
            <button type="button" className={styles.exAction} onClick={onAction}>
                Ir a mi plan
                <ArrowRight size={14} strokeWidth={2.5} aria-hidden="true" />
            </button>
        </>
    );
}

/* ----- tarjeta (memoizada: sólo re-renderiza si SU notificación o su estado
   de expansión cambian — clave de rendimiento con muchas notificaciones) ----- */

const NotificationCard = memo(function NotificationCard({ n, expanded, onToggle, onRemove, onAction, onRestore }) {
    const { Icon, tone } = metaFor(n);
    const unread = !n.read;
    const hasDetail = n.kind === 'micros' || n.kind === 'quality' || !!n.message;

    return (
        <motion.article
            layout
            className={`${styles.card} ${styles[`tone_${tone}`]} ${unread ? styles.unread : ''} ${expanded ? styles.expanded : ''}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
        >
            <div className={styles.cardRow}>
                <button
                    type="button"
                    className={styles.cardToggle}
                    onClick={() => onToggle(n)}
                    aria-expanded={expanded}
                    aria-label={expanded ? 'Contraer' : 'Ver información completa'}
                >
                    <span className={styles.cardIcon} aria-hidden="true">
                        <Icon size={17} strokeWidth={2.2} />
                    </span>
                    <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>
                            {unread && <span className={styles.unreadDot} aria-hidden="true" />}
                            {n.title}
                        </p>
                        {!expanded && n.message && (
                            <p className={styles.cardMsg}>{n.message}</p>
                        )}
                        {n.ts && <span className={styles.cardTime}>{relativeTime(n.ts)}</span>}
                    </div>
                    {hasDetail && (
                        <ChevronDown
                            size={16}
                            strokeWidth={2.5}
                            className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
                            aria-hidden="true"
                        />
                    )}
                </button>
                <div className={styles.cardActions}>
                    {/* [P3-MICROS-RESTORE · 2026-06-19] "Volver a mostrar" — solo micros
                        (es el único aviso con un panel del dashboard que se puede re-mostrar). */}
                    {n.kind === 'micros' && (
                        <button
                            type="button"
                            className={styles.cardRestore}
                            onClick={() => onRestore(n)}
                            aria-label="Volver a mostrar en el panel"
                            title="Volver a mostrar en el panel"
                        >
                            <Eye size={15} strokeWidth={2.1} />
                        </button>
                    )}
                    <button
                        type="button"
                        className={styles.cardX}
                        onClick={() => onRemove(n.id)}
                        aria-label="Borrar notificación"
                        title="Borrar"
                    >
                        <Trash2 size={15} strokeWidth={2.1} />
                    </button>
                </div>
            </div>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        className={styles.cardExpanded}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className={styles.cardExpandedInner}>
                            {n.kind === 'micros' && n.data ? (
                                <MicrosDetail data={n.data} onAction={() => onAction(n)} />
                            ) : n.kind === 'quality' && n.data ? (
                                <QualityDetail data={n.data} onAction={() => onAction(n)} />
                            ) : (
                                <>
                                    {n.message && <p className={styles.exFallback}>{n.message}</p>}
                                    {(n.kind === 'micros' || n.kind === 'quality') && (
                                        <button type="button" className={styles.exAction} onClick={() => onAction(n)}>
                                            {n.kind === 'micros' ? (
                                                <><MessageCircle size={14} strokeWidth={2.25} aria-hidden="true" /> Preguntar al coach</>
                                            ) : (
                                                <>Ir a mi plan <ArrowRight size={14} strokeWidth={2.5} aria-hidden="true" /></>
                                            )}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.article>
    );
});

export default function NotificationCenter() {
    const [items, setItems] = useState(() => getNotifications());
    const [open, setOpen] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const navigate = useNavigate();
    const { isGuest } = useAssessment();

    useEffect(() => {
        // Limpieza one-time de duplicados legacy (ids por timestamp) al montar.
        dedupeNotifications();
        setItems(getNotifications());
        const sync = () => setItems(getNotifications());
        // [P1-COHERENCE-BANNER-NOTIF · 2026-06-16] Un banner del dashboard puede
        // pedir abrir el centro tras archivar su aviso (X → "redirige a
        // notificaciones"). Sincronizamos primero para que el aviso recién
        // añadido ya esté en la lista cuando el drawer aparezca.
        const openReq = () => { setItems(getNotifications()); setOpen(true); };
        window.addEventListener(NOTIFICATIONS_EVENT, sync);
        window.addEventListener('storage', sync);
        window.addEventListener(NOTIFICATIONS_OPEN_EVENT, openReq);
        return () => {
            window.removeEventListener(NOTIFICATIONS_EVENT, sync);
            window.removeEventListener('storage', sync);
            window.removeEventListener(NOTIFICATIONS_OPEN_EVENT, openReq);
        };
    }, []);

    // [P1-NOTIF-MARK-READ-ON-OPEN · 2026-06-16] Al ABRIR el centro, marcar TODO
    // como leído automáticamente (el usuario ya las está viendo) → el badge de la
    // campana se limpia solo. markAllNotificationsRead es no-op si no hay nada sin
    // leer, y emite NOTIFICATIONS_EVENT → el listener de arriba refresca `items`.
    useEffect(() => {
        if (open) markAllNotificationsRead();
    }, [open]);

    const closeDrawer = useCallback(() => setOpen(false), []);

    // Focus-trap + ESC + lock de scroll del body + restore-focus al tirador.
    const { containerRef } = useModalAccessibility({ isOpen: open, onClose: closeDrawer });

    const count = items.length;
    const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

    // Borrado directo: removeNotification actualiza el store → el item sale del
    // array → AnimatePresence reproduce su exit. Sin timeouts que limpiar.
    const handleRemove = useCallback((id) => {
        setExpandedId((cur) => (cur === id ? null : cur));
        removeNotification(id);
    }, []);
    const handleClearAll = useCallback(() => {
        setExpandedId(null);
        clearNotifications();
    }, []);

    // [P3-MICROS-RESTORE · 2026-06-19] "Volver a mostrar" un aviso de micros: limpia
    // su dismissal (vía restoreMicrosPanel → el panel re-aparece en el dashboard, o
    // queda destrabado para cuando el usuario vuelva), lo saca del centro y cierra
    // el drawer para revelar el resultado. Más control para el usuario: ocultar ya
    // no es definitivo.
    const handleRestore = useCallback((n) => {
        const sig = (typeof n.id === 'string' && n.id.startsWith('micros_c_'))
            ? n.id.slice('micros_c_'.length)
            : null;
        restoreMicrosPanel(sig);
        setExpandedId((cur) => (cur === n.id ? null : cur));
        removeNotification(n.id);
        toast('Listo, lo mostramos de nuevo', {
            description: 'El panel de micronutrientes vuelve a tu dashboard.',
        });
        closeDrawer();
    }, [closeDrawer]);

    // Expandir/contraer; al expandir, marca leída.
    const handleToggle = useCallback((n) => {
        setExpandedId((cur) => {
            const next = cur === n.id ? null : n.id;
            if (next && !n.read) markNotificationRead(n.id);
            return next;
        });
    }, []);

    // CTA de cada notificación: micros → preguntar al coach (prefill + navegar);
    // quality → ir al plan. Para invitados, el chat está gateado → gancho de cuenta.
    const handleAction = useCallback((n) => {
        if (!n.read) markNotificationRead(n.id);
        // Orden: prefill (si aplica) → navigate → closeDrawer. El prefill debe
        // fijarse antes de que monte AgentPage; cerrar el drawer al final evita
        // que el restore-focus del modal compita con el focus del destino.
        if (n.kind === 'micros') {
            const gaps = Array.isArray(n.data?.gaps) ? n.data.gaps : [];
            const names = gaps.map((g) => g.nutriente).filter(Boolean).join(', ');
            const question = names
                ? `Mi plan se queda corto/desbalanceado en: ${names}. ¿Qué alimentos o ajustes concretos me recomiendas para mejorarlos sin afectar mis otras metas?`
                : 'Mi plan tiene algunos micronutrientes fuera de objetivo. ¿Qué alimentos o ajustes me recomiendas?';
            if (isGuest) {
                toast('Crea tu cuenta para hablar con tu coach IA', {
                    description: 'Te dirá exactamente cómo mejorar cada micronutriente de tu plan.',
                });
                navigate('/register');
                closeDrawer();
                return;
            }
            requestAgentPrefill(question);
            navigate('/dashboard/agent');
            closeDrawer();
            return;
        }
        // quality (u otros): llevar al plan donde están Cambiar Plato / Regenerar.
        navigate('/dashboard');
        closeDrawer();
    }, [isGuest, navigate, closeDrawer]);

    const trigger = (
        <button
            type="button"
            className={`${styles.handle} ${open ? styles.handleOpen : ''} ${unreadCount > 0 ? styles.handleAlert : ''}`}
            onClick={() => setOpen((v) => !v)}
            aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
            aria-expanded={open}
        >
            <span className={styles.handleGlow} aria-hidden="true" />
            <Bell size={19} strokeWidth={2.2} className={styles.handleIcon} />
            {unreadCount > 0 && (
                <span className={styles.handleBadge} aria-hidden="true">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );

    const drawer = (
        <AnimatePresence>
            {open && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <button
                        type="button"
                        className={styles.scrim}
                        aria-label="Cerrar notificaciones"
                        onClick={closeDrawer}
                    />
                    <motion.aside
                        ref={containerRef}
                        tabIndex={-1}
                        className={styles.drawer}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Centro de notificaciones"
                        initial={{ x: '110%', opacity: 0.6 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '110%', opacity: 0.4 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 38 }}
                    >
                        <header className={styles.head}>
                            <div className={styles.headTitle}>
                                <span className={`${styles.headDot} ${unreadCount > 0 ? styles.headDotAlert : ''}`} aria-hidden="true" />
                                <h2>Notificaciones</h2>
                                {count > 0 && <span className={styles.headCount}>{count}</span>}
                            </div>
                            <div className={styles.headActions}>
                                {unreadCount > 0 && (
                                    <button
                                        type="button"
                                        className={styles.markBtn}
                                        onClick={() => markAllNotificationsRead()}
                                        aria-label="Marcar todas como leídas"
                                        title="Marcar todas como leídas"
                                    >
                                        <CheckCheck size={17} strokeWidth={2.2} />
                                    </button>
                                )}
                                {count > 0 && (
                                    <button
                                        type="button"
                                        className={styles.clearBtn}
                                        onClick={handleClearAll}
                                        aria-label="Limpiar todas las notificaciones"
                                    >
                                        Limpiar
                                    </button>
                                )}
                                {count > 0 && <span className={styles.headDivider} aria-hidden="true" />}
                                <button
                                    type="button"
                                    className={styles.closeBtn}
                                    onClick={closeDrawer}
                                    aria-label="Cerrar notificaciones"
                                >
                                    <X size={18} strokeWidth={2.4} />
                                </button>
                            </div>
                        </header>

                        <div className={styles.list}>
                            {count === 0 ? (
                                <div className={styles.empty}>
                                    <span className={styles.emptyOrb} aria-hidden="true">
                                        <BellOff size={26} strokeWidth={1.8} />
                                    </span>
                                    <p className={styles.emptyTitle}>Todo al día</p>
                                    <p className={styles.emptyText}>
                                        Cuando descartes un aviso (micronutrientes, calidad del
                                        plan…) se guardará aquí.
                                    </p>
                                </div>
                            ) : (
                                <AnimatePresence initial={false}>
                                    {items.map((n) => (
                                        <NotificationCard
                                            key={n.id}
                                            n={n}
                                            expanded={expandedId === n.id}
                                            onToggle={handleToggle}
                                            onRemove={handleRemove}
                                            onAction={handleAction}
                                            onRestore={handleRestore}
                                        />
                                    ))}
                                </AnimatePresence>
                            )}
                        </div>

                        <footer className={styles.foot} aria-hidden="true">
                            <span className={styles.footBrand}>
                                Mealfit<span className={styles.footR}>R</span><span className={styles.footD}>D</span>
                            </span>
                        </footer>
                    </motion.aside>
                </motion.div>
            )}
        </AnimatePresence>
    );

    if (typeof document === 'undefined') return null;
    return createPortal(
        <>
            {trigger}
            {drawer}
        </>,
        document.body,
    );
}
