// [P2-CONFIRM-DIALOG-PLACEMENT · 2026-09-04] Host único de las confirmaciones de
// `confirmToast`. Se monta UNA vez en App.jsx (junto al <Toaster/>) y dibuja la
// petición vigente sobre el `Modal` común: centrado en escritorio, hoja inferior en
// móvil (arrastre para cerrar), foco atrapado, Escape y clic fuera = cancelar.
// El mismo lenguaje que «¿Eliminar esta conversación?» (P2-CHAT-DELETE-CONFIRM):
// icono en círculo, pregunta en negrita, explicación en gris, dos botones a lo
// ancho — Cancelar fantasma, confirmar sólido (rojo si `danger`).
import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Modal from './Modal';
import { subscribeConfirmHost } from '../../utils/confirmToast';

const ConfirmDialogHost = () => {
    const [req, setReq] = useState(null);

    useEffect(() => {
        const unsubscribe = subscribeConfirmHost((next) => {
            // una a la vez: la anterior, si quedaba abierta, se resuelve como cancelada
            setReq((prev) => {
                if (prev && prev.id !== next.id) {
                    try { prev.finish(false); } catch (_e) { /* noop */ }
                }
                return next;
            });
        });
        return unsubscribe;
    }, []);

    const close = useCallback((value) => {
        setReq((prev) => {
            if (prev) {
                try { prev.finish(value); } catch (_e) { /* noop */ }
            }
            return null;
        });
    }, []);

    const onCancel = useCallback(() => close(false), [close]);
    const onConfirm = useCallback(() => close(true), [close]);

    const Icon = req?.danger ? AlertTriangle : HelpCircle;

    return (
        <Modal
            isOpen={!!req}
            onClose={onCancel}
            titleId="bb-confirm-dialog-title"
            maxWidth="420px"
            isBottomSheetOnMobile={true}
        >
            {req && (
                <div role="alertdialog" aria-labelledby="bb-confirm-dialog-title" aria-describedby={req.description ? 'bb-confirm-dialog-desc' : undefined}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem', marginBottom: req.description ? '0.75rem' : '1.25rem' }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                            display: 'grid', placeItems: 'center',
                            background: req.danger ? 'var(--danger-bg)' : 'var(--bg-muted)',
                            color: req.danger ? 'var(--danger)' : 'var(--primary)',
                            border: `1px solid ${req.danger ? 'var(--danger-border)' : 'var(--border)'}`,
                        }}>
                            <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
                        </div>
                        <h3 id="bb-confirm-dialog-title" style={{ margin: '0.45rem 2rem 0 0', fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.3 }}>
                            {req.message}
                        </h3>
                    </div>
                    {req.description && (
                        <p id="bb-confirm-dialog-desc" style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                            {req.description}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                        <button
                            type="button"
                            onClick={onCancel}
                            style={{
                                flex: 1, padding: '0.8rem 1rem', borderRadius: '0.8rem', cursor: 'pointer',
                                background: 'transparent', border: '1px solid var(--border)',
                                color: 'var(--text-main)', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit',
                            }}
                        >
                            {req.cancelLabel}
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className={req.danger ? 'ui-btn-danger' : undefined}
                            autoFocus
                            style={{
                                flex: 1, padding: '0.8rem 1rem', borderRadius: '0.8rem', cursor: 'pointer',
                                fontWeight: 700, fontSize: '0.95rem', fontFamily: 'inherit',
                                ...(req.danger ? {} : { background: 'var(--primary-fill, #4F46E5)', color: '#fff', border: '1px solid transparent' }),
                            }}
                        >
                            {req.confirmLabel}
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default ConfirmDialogHost;
