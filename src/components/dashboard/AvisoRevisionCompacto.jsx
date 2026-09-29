// [P1-PLAN-LOTE-846 · 2026-09-29] La versión compacta y FIJA del banner de revisión profesional (Apple 1.4.1;
// auditoría §A.4.4). Antes, la X del banner (P2-PRO-REVIEW-DISMISS) lo hacía desaparecer del todo; ahora al cerrarlo
// queda esta línea con el mismo acento (rojo renal, azul el resto) y «Ver aviso», que lo vuelve a desplegar. Sin X:
// el recordatorio de consultar a un profesional no desaparece mientras el plan lo pida.
import PropTypes from 'prop-types';
import { AlertCircle } from 'lucide-react';
import { useT } from '../../i18n';

const AvisoRevisionCompacto = ({ renal, onVerAviso }) => {
    const t = useT();
    return (
        <div
            role="note"
            data-testid="pro-review-compacto"
            style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
                padding: '0.6rem 0.9rem', marginBottom: '1.5rem', borderRadius: '0.85rem',
                background: renal ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                border: renal ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(59, 130, 246, 0.35)',
            }}
        >
            <AlertCircle size={18} color={renal ? '#EF4444' : '#3B82F6'} style={{ flexShrink: 0 }} aria-hidden="true" />
            <span style={{ flex: '1 1 14rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {renal
                    ? t('Condición renal — este plan requiere supervisión de tu nefrólogo')
                    : t('Consulta a tu profesional de salud antes de seguir este plan.')}
            </span>
            <button
                type="button"
                onClick={onVerAviso}
                style={{
                    background: 'transparent', border: 0, padding: '0.35rem 0.25rem', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', fontFamily: 'inherit',
                }}
            >
                {t('Ver aviso')}
            </button>
        </div>
    );
};

AvisoRevisionCompacto.propTypes = {
    renal: PropTypes.bool,
    onVerAviso: PropTypes.func.isRequired,
};

export default AvisoRevisionCompacto;
