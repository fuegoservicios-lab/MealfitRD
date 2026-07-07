// [P3-RESTOCK-NUDGE · 2026-06-23] UI + efectos del nudge para llenar la Nevera
// tras comprar. Encapsula las 4 capas (banner / prompt / auto-fill / recordatorio)
// para que la integración en el Dashboard (4000+ líneas) sea un solo <RestockNudge>.
// Toda la lógica de DECISIÓN vive en utils/restockNudge.js (testeada); aquí solo
// el render y los disparadores. El restock real lo hace el Dashboard (SSOT del
// handler), que se pasa como `onConfirmRestock` (con navegación) y
// `onSilentRestock` (silencioso, para el auto-fill de fondo).

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, X, Check } from 'lucide-react';
import { addNotification } from '../../utils/notifications';
import {
    planNudgeKey,
    shouldShowBanner,
    shouldShowPrompt,
    shouldAutoFill,
    shouldSendReminder,
    dismissBanner,
    setSnooze,
    markAutoFilled,
    markReminderSent,
} from '../../utils/restockNudge';

export default function RestockNudge({
    planData,
    hasPendingItems,
    restocked,
    daysSinceGroceryStart,
    onConfirmRestock,
    onSilentRestock,
}) {
    const nowMs = Date.now();
    const k = planNudgeKey(planData);
    const ctx = { planData, hasPendingItems, restocked, daysSinceGroceryStart, nowMs };

    const [bannerHidden, setBannerHidden] = useState(false);
    const [promptOpen, setPromptOpen] = useState(false);
    const promptDismissedSession = useRef(false);
    const autoFillFired = useRef(false);
    const reminderFired = useRef(false);
    // [P2-RESTOCK-PROMPT-ONCE · 2026-06-29] El prompt se auto-abre A LO SUMO UNA VEZ por sesión. Antes el
    // useEffect re-evaluaba shouldShowPrompt en CADA cambio de deps (planData/hasPendingItems/restocked), así
    // que un swap o un recalc — que cambian hasPendingItems/is_restocked — re-abrían el modal a media edición.
    const promptAutoShownSession = useRef(false);

    // #4 recordatorio (campana) + #3 auto-fill de respaldo. Ambos one-shot por plan.
    useEffect(() => {
        if (!planData || !k) return;

        // #4: deja una entrada re-leíble en el centro de notificaciones la primera
        // vez que llega la fecha de compra y el plan sigue sin llenar.
        if (!reminderFired.current && shouldSendReminder(ctx)) {
            reminderFired.current = true;
            markReminderSent(k);
            addNotification({
                id: `restock_reminder_${k}`,
                kind: 'info',
                title: 'Llena tu Nevera tras comprar',
                message:
                    'Cuando termines las compras de tu plan, toca "Ya compré la lista" para llenar tu Nevera. Así tu plan usa lo que ya tienes en casa.',
                severity: 'info',
            });
        }

        // #3: opt-out de último recurso. Llena la Nevera en silencio y avisa que es
        // reversible (el usuario quita lo que no compró desde la Nevera).
        if (!autoFillFired.current && shouldAutoFill(ctx) && typeof onSilentRestock === 'function') {
            autoFillFired.current = true; // guard in-flight (síncrono, este mount) contra doble POST
            Promise.resolve(onSilentRestock())
                .then(() => {
                    markAutoFilled(k); // persiste SOLO si el POST tuvo éxito → fallo ⇒ reintenta
                    addNotification({
                        id: `restock_autofill_${k}`,
                        kind: 'info',
                        title: 'Llenamos tu Nevera automáticamente',
                        message:
                            'Pasaron unos días desde el inicio de tu plan y tu Nevera seguía vacía, así que la llenamos con tu lista de compras. Revísala y quita lo que no hayas comprado.',
                        severity: 'info',
                    });
                })
                .catch(() => {
                    // Falló el POST: permite reintentar en el próximo app-open (nuevo mount).
                    autoFillFired.current = false;
                });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData, restocked, hasPendingItems, daysSinceGroceryStart, k]);

    // #2 prompt: abrir cuando corresponde. El auto-fill (día 3+) tiene precedencia
    // y el descarte en sesión evita re-abrir en cada render.
    useEffect(() => {
        if (promptDismissedSession.current) {
            setPromptOpen(false);
            return;
        }
        if (shouldAutoFill(ctx)) {
            setPromptOpen(false);
            return;
        }
        // [P2-RESTOCK-PROMPT-ONCE · 2026-06-29] Si el plan dejó de ser elegible (ya restocked / sin pendientes),
        // ciérralo. Si ES elegible, AUTO-ÁBRELO SOLO la primera vez de la sesión — NO en cada swap/recalc que
        // cambió las deps. El banner persistente (#1) sigue nudgeando; el usuario reabre el prompt cuando quiera.
        if (!shouldShowPrompt(ctx)) {
            setPromptOpen(false);
            return;
        }
        if (!promptAutoShownSession.current) {
            promptAutoShownSession.current = true;
            setPromptOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData, restocked, hasPendingItems, daysSinceGroceryStart, k]);

    if (!planData) return null;

    const confirm = () => {
        setPromptOpen(false);
        if (typeof onConfirmRestock === 'function') onConfirmRestock();
    };
    const todaviaNo = () => {
        promptDismissedSession.current = true;
        setPromptOpen(false);
        if (k) setSnooze(k, nowMs);
    };
    const dismissPrompt = () => {
        promptDismissedSession.current = true;
        setPromptOpen(false);
    };
    const hideBanner = () => {
        setBannerHidden(true);
        if (k) dismissBanner(k);
    };

    const bannerVisible = !bannerHidden && !promptOpen && shouldShowBanner(ctx);

    return (
        <>
            {/* [P3-RESTOCK-BANNER-MOBILE · 2026-07-02] Layout del banner por CLASES
                (antes inline flex-wrap): en móvil el CTA y la X caían sueltos abajo a
                la izquierda. Ahora ≤640px es un grid — icono + texto arriba, X en la
                esquina superior derecha, CTA verde full-width abajo. Desktop intacto. */}
            <style>{`
                .restock-nudge-banner {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    background: rgba(16, 185, 129, 0.09);
                    border: 1.5px solid rgba(16, 185, 129, 0.45);
                    border-radius: 1rem;
                    padding: 0.85rem 1.1rem;
                    margin-bottom: 1.5rem;
                }
                .restock-nudge-ico {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 34px;
                    height: 34px;
                    border-radius: 50%;
                    background: rgba(16, 185, 129, 0.16);
                    flex-shrink: 0;
                }
                .restock-nudge-txt { flex: 1; min-width: 200px; }
                .restock-nudge-title {
                    font-weight: 700;
                    color: var(--text-main);
                    font-size: 0.92rem;
                    display: block;
                    margin-bottom: 0.12rem;
                }
                .restock-nudge-desc { color: var(--text-muted); font-size: 0.83rem; line-height: 1.45; }
                .restock-nudge-cta {
                    background: #10B981;
                    color: #fff;
                    border: none;
                    padding: 0.55rem 1.05rem;
                    border-radius: 0.7rem;
                    font-weight: 700;
                    font-size: 0.83rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.4rem;
                    white-space: nowrap;
                }
                /* [P3-RESTOCK-CTA-DARK · 2026-07-07] En modo oscuro el emerald-500 pleno
                   (#10B981) queda demasiado brilloso sobre la tarjeta oscura. Bajamos a
                   emerald-600 (#059669) — sigue leyéndose como CTA verde sin deslumbrar. */
                html[data-theme="dark"] .restock-nudge-cta {
                    background: #059669;
                    color: rgba(255, 255, 255, 0.95);
                }
                .restock-nudge-x {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 0.25rem;
                    display: flex;
                    align-items: center;
                }
                @media (max-width: 640px) {
                    .restock-nudge-banner {
                        display: grid;
                        grid-template-columns: auto 1fr auto;
                        align-items: start;
                        column-gap: 0.6rem;
                        row-gap: 0.75rem;
                        padding: 0.95rem 0.9rem 0.85rem;
                    }
                    .restock-nudge-ico { grid-area: 1 / 1; width: 32px; height: 32px; }
                    .restock-nudge-txt { grid-area: 1 / 2; min-width: 0; }
                    .restock-nudge-x {
                        grid-area: 1 / 3;
                        align-self: start;
                        margin: -0.2rem -0.2rem 0 0;
                        padding: 0.35rem;
                    }
                    .restock-nudge-cta {
                        grid-area: 2 / 1 / 3 / 4;
                        width: 100%;
                        padding: 0.7rem 1rem;
                        font-size: 0.88rem;
                    }
                }
            `}</style>

            {/* ── #1 Banner persistente y descartable ── */}
            <AnimatePresence>
                {bannerVisible && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                        role="status"
                        className="restock-nudge-banner"
                    >
                        <span aria-hidden="true" className="restock-nudge-ico">
                            <ShoppingCart size={18} color="#10B981" strokeWidth={2.1} />
                        </span>
                        <div className="restock-nudge-txt">
                            <span className="restock-nudge-title">
                                Tu Nevera está vacía para este plan
                            </span>
                            <span className="restock-nudge-desc">
                                ¿Ya hiciste las compras? Llénala con un toque para que tu plan use lo que tienes.
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={confirm}
                            className="restock-nudge-cta"
                        >
                            <Check size={15} strokeWidth={2.5} />
                            Sí, ya compré
                        </button>
                        <button
                            type="button"
                            onClick={hideBanner}
                            aria-label="Descartar aviso"
                            title="Descartar"
                            className="restock-nudge-x"
                        >
                            <X size={16} strokeWidth={2.25} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── #2 Prompt al abrir la app tras la fecha de compra ── */}
            <AnimatePresence>
                {promptOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={dismissPrompt}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                            padding: '1rem',
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="restock-nudge-title"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 8 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: 'var(--bg-card)',
                                borderRadius: '1.25rem',
                                padding: '1.75rem 1.5rem',
                                maxWidth: '380px',
                                width: '100%',
                                textAlign: 'center',
                                boxShadow: '0 20px 50px -12px rgba(0,0,0,0.4)',
                            }}
                        >
                            <div
                                aria-hidden="true"
                                style={{
                                    width: '52px',
                                    height: '52px',
                                    borderRadius: '50%',
                                    background: 'rgba(16, 185, 129, 0.14)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1rem',
                                }}
                            >
                                <ShoppingCart size={24} color="#10B981" strokeWidth={1.9} />
                            </div>
                            <h2
                                id="restock-nudge-title"
                                style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem', letterSpacing: '-0.015em' }}
                            >
                                ¿Ya hiciste las compras?
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.55, margin: '0 auto 1.5rem', maxWidth: '320px' }}>
                                Si ya compraste tu lista, llenamos tu Nevera para que tu plan aproveche lo que tienes y no vuelvas a comprar de más.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={confirm}
                                    style={{
                                        background: '#10B981',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '0.8rem 1rem',
                                        borderRadius: '0.85rem',
                                        fontWeight: 700,
                                        fontSize: '0.92rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.45rem',
                                    }}
                                >
                                    <Check size={17} strokeWidth={2.4} />
                                    Sí, ya compré — llenar mi Nevera
                                </button>
                                <button
                                    type="button"
                                    onClick={todaviaNo}
                                    style={{
                                        background: 'transparent',
                                        color: 'var(--text-muted)',
                                        border: 'none',
                                        padding: '0.55rem',
                                        fontWeight: 600,
                                        fontSize: '0.88rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Todavía no
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
