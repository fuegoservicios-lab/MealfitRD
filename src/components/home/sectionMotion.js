/* [P1-LANDING-MOTION · 2026-07-11 · consumidores actualizados P1-PAPER-BENCHMARK · 2026-08-02]
   Lenguaje de motion COMPARTIDO de las secciones del landing. Hoy lo consumen
   DOS: `DashboardShowcase` y `NewsHighlight`. `HowItWorks` y `BenchmarkShowcase`
   se pasaron a un `IntersectionObserver` propio + transiciones CSS al migrar a
   papel —su vocabulario es TRAZADO (`stroke-dashoffset`), que framer-motion no
   aporta nada a orquestar— pero **reutilizan este mismo easing escrito a mano**:
   `cubic-bezier(0.22, 1, 0.36, 1)` es `LANDING_EASE`. Si cambias el valor de
   aquí, esos dos módulos hay que tocarlos también o el landing deja de sentirse
   como UNA pieza, que es justo lo que este fichero existe para garantizar.
   (Hero mantiene su factory propia por sus variantes de titular.)

   Contrato:
   - GPU-only (opacity/transform); nada de layout props.
   - `reduce` (useReducedMotion) → fade puro sin desplazamiento, duración ~0
     (mismo patrón doble-defensa que Hero.jsx / index.css).
   - Entradas con ease-out editorial; usar con whileInView + viewport once. */
export const LANDING_EASE = [0.22, 1, 0.36, 1];

export const makeSectionMotion = (reduce) => ({
    /* Contenedor que orquesta hijos en cascada (stagger). */
    container: {
        hidden: {},
        show: { transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: reduce ? 0 : 0.04 } },
    },
    /* Fade-rise estándar de bloques. */
    rise: {
        hidden: { opacity: 0, y: reduce ? 0 : 20 },
        show: { opacity: 1, y: 0, transition: { duration: reduce ? 0.001 : 0.6, ease: LANDING_EASE } },
    },
});
