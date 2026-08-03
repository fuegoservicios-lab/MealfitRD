import { useLayoutEffect } from 'react';
import Pricing from '../components/home/Pricing';
// [P2-PAPER-NO-INK · 2026-08-02, Task 13] Banda de cierre: última hija de las 6
// rutas papel. Va en componente propio y NUNCA dentro de Footer.jsx — el footer
// se renderiza en 21 rutas, incluidas las 10 legales, y un CTA de conversión no
// pinta en la política de privacidad (ver ClosingBand.jsx).
import ClosingBand from '../components/home/ClosingBand';
import styles from './PricingPage.module.css';

/* [P3-PRICING-PAGE-BG-SEAM · 2026-06-29] Página /precios. Envuelve el componente de
   planes y sube su sección bajo la barra flotante para que el fondo llene detrás del
   header (sin la "caja"/costura), igual que el Hero en el landing. Ver CSS. */
const PricingPage = () => {
    // [P3-PRICING-SCROLL-TOP · 2026-06-29] El ScrollRestoration global NO toca la
    // navegación cliente (cada página resetea su scroll). Al entrar desde el landing
    // ya scrolleado, sin esto /precios heredaba la posición. useLayoutEffect → resetea
    // antes del paint, sin parpadeo.
    useLayoutEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <>
            <div className={styles.wrap}>
                <Pricing />
            </div>
            <ClosingBand />
        </>
    );
};

export default PricingPage;
