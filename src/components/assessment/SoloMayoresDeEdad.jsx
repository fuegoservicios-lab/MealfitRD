// [P1-PLAN-LOTE-846 · 2026-09-29] La pantalla que corta el formulario cuando la edad es de un menor.
//
// Los Términos (§2) y la Privacidad (§11) dicen «solo mayores de 18»; hasta este lote el formulario aceptaba de 12 a
// 100 años y mandaba el perfil de salud de un chico a la IA (auditoría App Store, fila 16.2, §A.9). El formulario la
// pinta en su propio marco (`InteractiveAssessmentLayout` con `bloqueo`): el título dice el porqué y esto, qué hacer.
//
// No guarda ni envía NADA: el formulario ya borró la edad escrita al cortar, y aquí no hay ni una llamada a la red.
// Las dos salidas:
//   · «Entendido, salir» — sale del formulario como la salida de la cabecera (el invitado pierde lo que llevaba; la
//     cuenta cierra sesión), sin el diálogo de confirmación: aquí no hay nada que perder.
//   · «Me equivoqué al escribir mi edad» — vuelve al campo, vacío. Un 8 en vez de un 28 no puede dejar a un adulto
//     fuera; y quien quiera mentir podía hacerlo desde el principio (la edad es declarada, como en toda la tienda).
import PropTypes from 'prop-types';
import { LogOut } from 'lucide-react';
import { useT } from '../../i18n';
import styles from './SoloMayoresDeEdad.module.css';

const SoloMayoresDeEdad = ({ onSalir, onCorregir }) => {
    const t = useT();
    return (
        <div className={styles.corte} data-testid="solo-mayores-de-edad">
            <button type="button" className={styles.salir} onClick={onSalir}>
                <LogOut size={18} aria-hidden="true" />
                {t('Entendido, salir')}
            </button>
            <button type="button" className="mf-ghost-btn" onClick={onCorregir}>
                {t('Me equivoqué al escribir mi edad')}
            </button>
        </div>
    );
};

SoloMayoresDeEdad.propTypes = {
    onSalir: PropTypes.func.isRequired,
    onCorregir: PropTypes.func.isRequired,
};

export default SoloMayoresDeEdad;
