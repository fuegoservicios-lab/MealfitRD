/* [P1-LANDING-MOTION · 2026-07-11] Lenguaje de motion COMPARTIDO de las secciones
   del landing (HowItWorks, DashboardShowcase, BenchmarkShowcase, NewsHighlight;
   Hero mantiene su factory propia por sus variantes de titular). Un solo easing y
   una sola cadencia → el landing se siente como UNA pieza, no secciones sueltas.

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
    /* Entradas laterales para layouts a dos columnas (visual ← / contenido →). */
    riseLeft: {
        hidden: { opacity: 0, x: reduce ? 0 : -28 },
        show: { opacity: 1, x: 0, transition: { duration: reduce ? 0.001 : 0.65, ease: LANDING_EASE } },
    },
    riseRight: {
        hidden: { opacity: 0, x: reduce ? 0 : 26 },
        show: { opacity: 1, x: 0, transition: { duration: reduce ? 0.001 : 0.55, ease: LANDING_EASE } },
    },
    /* Subrayado decorativo que se dibuja (scaleX). */
    underline: {
        hidden: { opacity: 0, scaleX: reduce ? 1 : 0 },
        show: { opacity: 1, scaleX: 1, transition: { duration: reduce ? 0.001 : 0.6, ease: LANDING_EASE, delay: reduce ? 0 : 0.15 } },
    },
});
