import { Link } from 'react-router-dom';
import styles from './ClosingBand.module.css';
import { useAssessment } from '../../context/AssessmentContext';

/* [P1-PAPER-THEME · 2026-08-01] BANDA DE CIERRE — última hija de las páginas de
 * marketing (hoy solo Home.jsx; las restantes 5 rutas papel la montan en la
 * Task 13). Antes de esto el último bloque del landing era el changelog de
 * NewsHighlight (2 filas): el sitio se acababa sin volver a pedir el clic ni
 * una sola vez. Esta banda pide el clic una última vez, en la superficie
 * correcta.
 *
 * FONDO PAPEL, NO INVERTIDO. El footer sigue siendo el único bloque negro del
 * sistema — si esta banda también invirtiera, dejaría de significar algo.
 *
 * VA EN COMPONENTE PROPIO, NUNCA DENTRO DE Footer.jsx: el footer se renderiza
 * en 21 rutas, incluidas las 10 legales, y un CTA de conversión no pinta en
 * la política de privacidad.
 *
 * Sin bloque `data-theme`: como el resto de components/home/*, solo se sirve
 * bajo la superficie papel (utils/paperSurface.js), así que consume var(--pa-*)
 * directamente.
 *
 * Sin motion: es el último bloque de la página, no un contenido que aparezca
 * mientras se hace scroll hacia arriba desde abajo con nada que revelar — un
 * fade-in aquí sería movimiento sin motivo, así que no lleva framer-motion ni
 * necesita su bloque prefers-reduced-motion.
 */
const ClosingBand = () => {
    const { planData } = useAssessment();
    const hasPlan = Boolean(planData);

    return (
        <section className={styles.closing}>
            <div className={styles.container}>
                <h2 className={styles.title}>
                    Tu primer plan, calculado, en cinco minutos.
                </h2>

                {/* Mismo literal atado por Header.sticky_cta.test.jsx que el CTA
                    del header y del Hero ('Crear mi Plan Ahora' / 'Ver mi Plan').
                    No se reescribe. */}
                {hasPlan ? (
                    <Link to="/dashboard" className={styles.cta}>
                        Ver mi Plan
                    </Link>
                ) : (
                    <Link to="/assessment" className={styles.cta}>
                        Crear mi Plan Ahora
                    </Link>
                )}

                <Link to="/precios" className={styles.priceLine}>
                    GRATIS · 10 PLANES AL MES · VER PLANES →
                </Link>
            </div>
        </section>
    );
};

export default ClosingBand;
