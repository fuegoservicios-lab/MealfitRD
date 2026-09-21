// [P2-CI-ARRANQUE-CONFIRM · 2026-09-16] El diálogo de `confirmToast`, en su propio trozo. Lo carga
// `ConfirmDialogHost` con la primera confirmación: `Modal` arrastra framer-motion y, importado de forma
// estática desde el host (que vive en App.jsx), entraba en la carga inicial de TODAS las rutas.
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Modal from './Modal';

const ConfirmDialog = ({ req, onCancel, onConfirm }) => {
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
                        {/* [P1-PLAN-LOTE-151] Los dos botones del diálogo no contestaban al ratón: su estilo es EN
                            LÍNEA, que no admite `:hover`. Cada uno con su variante — fantasma el de cancelar, lleno
                            el de confirmar. */}
                        <button
                            type="button"
                            data-hover="fila"
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
                            data-hover="boton"
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

export default ConfirmDialog;
