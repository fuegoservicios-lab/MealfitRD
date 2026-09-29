// [P1-PLAN-LOTE-846 · 2026-09-29] La nota médica fija del plan y del contador (Apple 1.4.1; auditoría fila 7.1, §A.4.3).
//
// Hasta este lote el recordatorio de consultar al médico solo salía si el usuario había declarado algo (el banner de
// revisión profesional, que además se podía cerrar) y el Aviso Médico vivía solo en «Más información». Esta nota va
// SIEMPRE, sin X: pequeña, al pie del plan y del contador, con el enlace al Aviso Médico.
//
// El enlace es `apexUrl('/medical')`: en la web, el `/medical` del apex; en la app nativa, la variante sin navegación
// ni comercio (`/app/medical`) que resuelve `apexUrl` (lote 845). Pestaña nueva / Safari: no se pierde el plan.
import { Stethoscope } from 'lucide-react';
import { apexUrl } from '../../config/site';
import { BRAND } from '../../data/routeMeta';
import { useT } from '../../i18n';
import styles from './NotaAvisoMedico.module.css';

const NotaAvisoMedico = () => {
    const t = useT();
    return (
        <p className={styles.nota} role="note" data-testid="nota-aviso-medico">
            <Stethoscope size={14} aria-hidden="true" className={styles.icono} />
            <span>
                {t('{app} no sustituye el consejo médico. Consulta a tu médico antes de cambiar tu alimentación.', { app: BRAND })}
                {' '}
                <a href={apexUrl('/medical')} target="_blank" rel="noopener noreferrer" className={styles.enlace}>
                    {t('Aviso médico')}
                </a>
            </span>
        </p>
    );
};

export default NotaAvisoMedico;
