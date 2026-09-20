// [P1-PLAN-LOTE-129 · 2026-09-19] Un botón que se puede tocar SIN que la caja de escribir pierda el foco (ni el teclado).
//
// El dueño: «cuando cierro la foto en la x se me cierra el teclado y no debería». Es lo mismo que pasaba con el micrófono
// (lote 127): en iOS el foco no se va en `pointerdown`, sino cuando WebKit sintetiza `mousedown`/`click` tras el `touchend`
// — y `preventDefault` en pointerdown no lo evita. El remedio: atender el toque EN `touchend` y cancelarlo, de modo que
// WebKit no sintetiza nada y el foco nunca sale del campo. `mousedown` cancelado cubre el ratón, y un `click` que aun así
// llegue del mismo gesto no dispara la acción dos veces.
//
// Uso:  const sinFoco = useToqueSinFoco();   <button {...sinFoco(() => quitar(id))} />
// Devuelve una FÁBRICA (y no las props directamente) para poder usarla dentro de un `.map()`.
// El micrófono del chat usa la misma técnica escrita a mano (`handleMicTouchEnd`, anterior a este hook).
import { useCallback, useRef } from 'react';

/** Ventana en la que un clic tras un toque ya atendido se considera el MISMO gesto. */
export const CLIC_FANTASMA_MS = 700;

export function useToqueSinFoco() {
    const ultimoToqueRef = useRef(0);
    return useCallback((accion) => ({
        onMouseDown: (e) => e.preventDefault(),
        onTouchEnd: (e) => {
            if (!e.cancelable) return;                                   // venía de un desplazamiento, no de un toque
            const dedo = e.changedTouches?.[0];
            // `elementFromPoint` y no el rectángulo del botón: el área táctil puede ser mayor que su caja (pseudo-elemento)
            const debajo = dedo && typeof document.elementFromPoint === 'function'
                ? document.elementFromPoint(dedo.clientX, dedo.clientY)
                : null;
            if (debajo && !e.currentTarget.contains(debajo)) return;     // el dedo se fue del botón: no es un toque
            e.preventDefault();                                          // sin mousedown/click sintetizados: el foco no se mueve
            ultimoToqueRef.current = Date.now();
            accion(e);
        },
        onClick: (e) => {
            if (Date.now() - ultimoToqueRef.current < CLIC_FANTASMA_MS) return;
            accion(e);
        },
    }), []);
}
