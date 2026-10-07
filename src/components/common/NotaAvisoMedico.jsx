import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import HealthSources from './HealthSources';
import { Stethoscope } from 'lucide-react';
import { apexUrl } from '../../config/site';
import { BRAND } from '../../data/routeMeta';
import { useT } from '../../i18n';
import Modal from './Modal';
import styles from './NotaAvisoMedico.module.css';

const NotaAvisoMedico = () => {
    const t = useT();
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const titleId = useId();
    return (
        <>
            {/* Acceso permanente junto al título, sin desplazar los datos. */}
            <button type="button" className={styles.acceso} data-testid="nota-aviso-medico"
                title={t('Aviso médico')} aria-label={t('Aviso médico')}
                aria-haspopup="dialog" onClick={() => setOpen(true)}>
                <Stethoscope size={18} aria-hidden="true" />
            </button>
            {/* El portal evita que el contenedor de las barras recorte la ventana. */}
            {createPortal(
                <Modal isOpen={open} onClose={() => setOpen(false)} titleId={titleId} isBottomSheetOnMobile>
                    <h2 id={titleId} className={styles.titulo}>{t('Aviso médico')}</h2>
                    <p className={styles.explicacion}>
                        {t('{app} no sustituye el consejo médico. Consulta a tu médico antes de cambiar tu alimentación.', { app: BRAND })}
                    </p>
                    <a href={apexUrl('/medical')} target="_blank" rel="noopener noreferrer" className={styles.enlace}>
                        {t('Aviso médico')}
                    </a>
                    <HealthSources context="plan" />
                    <Link to="/medical#fuentes" state={{ from: location.pathname }} onClick={() => setOpen(false)} className={styles.enlace}>
                        {t('Fuentes de salud y nutrición')}
                    </Link>
                </Modal>, document.body
            )}
        </>
    );
};

export default NotaAvisoMedico;
