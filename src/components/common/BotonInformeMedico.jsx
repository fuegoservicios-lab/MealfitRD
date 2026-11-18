// [P1-PLAN-LOTE-1034 · 2026-11-17] Entrada al «Informe para tu médico» (cajón del calendario y Perfil clínico).
// [P1-PLAN-LOTE-1072] Abre una HOJA encima de donde estás, ya no otra página (el dueño lo veía raro). Sin estilos en
// línea: van en su módulo.
import { useState } from 'react';
import PropTypes from 'prop-types';
import { FileText, ChevronRight } from 'lucide-react';
import { useT } from '../../i18n';
import HojaInformeMedico from '../informe/HojaInformeMedico';
import styles from './BotonInformeMedico.module.css';

export default function BotonInformeMedico({ className }) {
    const t = useT();
    const [abierta, setAbierta] = useState(false);
    return (
        <>
            <button
                type="button"
                className={className || styles.boton}
                data-testid="boton-informe-medico"
                aria-haspopup="dialog"
                onClick={() => setAbierta(true)}
            >
                <span className={styles.icono} aria-hidden="true"><FileText size={18} strokeWidth={2.25} /></span>
                <span className={styles.texto}>
                    <strong>{t('Informe para tu médico')}</strong>
                    <small>{t('Un resumen de lo que registraste, en PDF')}</small>
                </span>
                <ChevronRight size={18} aria-hidden="true" className={styles.chevron} />
            </button>
            <HojaInformeMedico abierta={abierta} onCerrar={() => setAbierta(false)} />
        </>
    );
}

BotonInformeMedico.propTypes = { className: PropTypes.string };
