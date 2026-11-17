// [P1-PLAN-LOTE-1034 · 2026-11-17] Entrada al «Informe para tu médico» (cajón del calendario y Perfil clínico).
// Fuera de un router (pruebas que montan el cajón solo) no se pinta: `useNavigate` lanzaría.
import PropTypes from 'prop-types';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';
import { useT } from '../../i18n';

function Boton({ onAbrir, className }) {
    const t = useT();
    const navigate = useNavigate();
    return (
        <button
            type="button"
            className={className}
            data-testid="boton-informe-medico"
            onClick={() => { onAbrir?.(); navigate('/dashboard/informe'); }}
            style={className ? undefined : {
                display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', minHeight: 48,
                padding: '0.6rem 0.85rem', marginTop: '0.75rem', border: '1px solid var(--border)', borderRadius: 14,
                background: 'var(--bg-card)', color: 'var(--text-main)', font: 'inherit', textAlign: 'left', cursor: 'pointer',
            }}
        >
            <FileText size={18} aria-hidden="true" />
            <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: '0.92rem' }}>{t('Informe para tu médico')}</strong>
                <small style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {t('Un resumen de lo que registraste, en PDF')}
                </small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
        </button>
    );
}

Boton.propTypes = { onAbrir: PropTypes.func, className: PropTypes.string };

export default function BotonInformeMedico(props) {
    return useInRouterContext() ? <Boton {...props} /> : null;
}
