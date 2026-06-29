import Pricing from '../components/home/Pricing';
import styles from './PricingPage.module.css';

/* [P3-PRICING-PAGE-BG-SEAM · 2026-06-29] Página /precios. Envuelve el componente de
   planes y sube su sección bajo la barra flotante para que el fondo llene detrás del
   header (sin la "caja"/costura), igual que el Hero en el landing. Ver CSS. */
const PricingPage = () => (
    <div className={styles.wrap}>
        <Pricing />
    </div>
);

export default PricingPage;
