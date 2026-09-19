// [P1-PLAN-LOTE-122 · 2026-09-19] Los gestos del visor de fotos del chat, como decisiones PURAS.
//
// El visor solo entendía el deslizamiento horizontal (foto anterior / siguiente). Se le añade el gesto que todo visor
// de fotos del teléfono tiene: deslizar hacia ABAJO lo cierra, con la foto siguiendo al dedo. Con la página ampliada
// (pellizco) no hay gestos: ahí el dedo está moviéndose por la foto, no pidiendo nada.
export const VISOR_EJE_PX = 10;        // recorrido mínimo para decidir si el gesto es vertical u horizontal
export const VISOR_CERRAR_PX = 110;    // hacia abajo, cierra
export const VISOR_CERRAR_VEL = 0.55;  // px/ms: un golpe rápido hacia abajo también cierra
export const VISOR_PASAR_PX = 55;      // horizontal, cambia de foto

/** `null` mientras el recorrido no alcanza para decidir; después 'vertical' | 'horizontal' y ya no cambia. */
export function ejeDelGesto({ dx = 0, dy = 0 }) {
    if (Math.abs(dx) < VISOR_EJE_PX && Math.abs(dy) < VISOR_EJE_PX) return null;
    return Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
}

/** Qué hacer al soltar: 'cerrar' | 'anterior' | 'siguiente' | 'nada'. */
export function decidirGestoVisor({ eje, dx = 0, dy = 0, vy = 0, zoom = 1, varias = false }) {
    if (zoom > 1.01) return 'nada';
    if (eje === 'vertical') return dy > VISOR_CERRAR_PX || (dy > 30 && vy > VISOR_CERRAR_VEL) ? 'cerrar' : 'nada';
    if (eje === 'horizontal' && varias && Math.abs(dx) >= VISOR_PASAR_PX) return dx > 0 ? 'anterior' : 'siguiente';
    return 'nada';
}

/** Cuánto baja la foto y cuánto se apaga el fondo mientras el dedo arrastra (solo hacia abajo). */
export function arrastreDelVisor(dy) {
    const baja = Math.max(0, dy);
    return { baja, opacidad: Math.max(0.35, 1 - baja / 420) };
}
