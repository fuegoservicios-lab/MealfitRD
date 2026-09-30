// [P1-PLAN-LOTE-906 · 2026-09-29] La burbuja del modo voz se arrastra.
//
// El dueño: «que esté en una posición cómoda que no estorbe cuando esté minimizado». Fija abajo a la derecha tapaba
// «Ver días anteriores» y la última comida del Progreso. Se lleva con el dedo a donde moleste menos, sin salirse de la
// pantalla ni de la franja entre la cabecera y la barra de pestañas, y se recuerda en este dispositivo.
//
// [P1-PLAN-LOTE-908 · 2026-09-30] «Quiero moverla para cualquier lado; no me deja». Dos cosas:
//  · En el iPhone no se movía: la captura del dedo iba a la caja EXTERIOR (`pointer-events: none`) y los manejadores
//    viven en la FILA; con la captura, WebKit manda los `pointermove` siguientes a la caja y la fila deja de oírlos
//    tras el primer tirón. jsdom no implementa `setPointerCapture`, así que los tests no lo veían. Ahora se captura
//    en el nodo que tiene los manejadores (`e.currentTarget`).
//  · Ya no se pega al borde: se queda donde se suelta (dentro de la pantalla). El lado solo decide hacia dónde se
//    alinea el globo.
//
// Un arrastre no es un toque: si el dedo se movió, el `click` que sigue no llega a los botones de la burbuja.
import { useCallback, useEffect, useRef, useState } from 'react';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';

export const CLAVE_BURBUJA_POS = 'mealfit_voz_burbuja_pos';
export const BURBUJA_MARGEN = 8;
export const BURBUJA_ARRIBA = 72;    // debajo de la cabecera y la muesca
export const BURBUJA_ABAJO = 88;     // encima de la barra de pestañas
const UMBRAL_ARRASTRE = 8;

/** Dónde queda al soltarla: donde se soltó, dentro de la pantalla y de la franja permitida. */
export function encajar({ x, y, ancho, alto, vw, vh, arriba = BURBUJA_ARRIBA, abajo = BURBUJA_ABAJO }) {
    const maxX = Math.max(BURBUJA_MARGEN, vw - ancho - BURBUJA_MARGEN);
    const maxY = Math.max(arriba, vh - alto - abajo);
    const nx = Math.round(Math.min(Math.max(x, BURBUJA_MARGEN), maxX));
    const ny = Math.round(Math.min(Math.max(y, arriba), maxY));
    return { lado: nx + ancho / 2 < vw / 2 ? 'izq' : 'der', x: nx, y: ny };
}

function leer() {
    try {
        const p = JSON.parse(safeLocalStorageGet(CLAVE_BURBUJA_POS, 'null'));
        if (p && (p.lado === 'izq' || p.lado === 'der') && Number.isFinite(p.y)) {
            return { lado: p.lado, x: Number.isFinite(p.x) ? p.x : null, y: p.y };
        }
    } catch { /* guardado ilegible: la posición de siempre */ }
    return null;
}

export function useBurbujaArrastrable() {
    const [pos, setPos] = useState(leer);            // { lado, x, y } | null = la esquina de siempre (CSS)
    const [arrastre, setArrastre] = useState(null);  // { x, y } mientras el dedo la lleva
    const ref = useRef(null);
    // Referencia de función (no el objeto `ref`): la regla `react-hooks/refs` no deja leer un ref durante el render.
    const alMontar = useCallback((nodo) => { ref.current = nodo; }, []);
    const inicio = useRef(null);
    const ultimo = useRef(null);
    const movio = useRef(false);

    // Si la ventana cambia (girar el teléfono, teclado), la posición guardada se vuelve a encajar.
    useEffect(() => {
        const alCambiar = () => setPos((p) => {
            if (!p) return p;
            const r = ref.current?.getBoundingClientRect();
            const ancho = r?.width || 140;
            const alto = r?.height || 80;
            const n = encajar({ x: p.x ?? window.innerWidth, y: p.y, ancho, alto, vw: window.innerWidth, vh: window.innerHeight });
            return p.x == null ? { ...p, y: n.y } : (n.x === p.x && n.y === p.y ? p : n);
        });
        window.addEventListener('resize', alCambiar);
        return () => window.removeEventListener('resize', alCambiar);
    }, []);

    const onPointerDown = useCallback((e) => {
        if (e.button !== undefined && e.button !== 0) return;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        inicio.current = {
            px: e.clientX, py: e.clientY, x: r.left, y: r.top, ancho: r.width, alto: r.height, id: e.pointerId,
            nodo: e.currentTarget,
        };
        movio.current = false;
    }, []);

    const onPointerMove = useCallback((e) => {
        const i = inicio.current;
        if (!i) return;
        const dx = e.clientX - i.px;
        const dy = e.clientY - i.py;
        if (!movio.current && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return;
        if (!movio.current) {
            movio.current = true;
            // En el nodo que OYE (la fila), no en la caja: ver la cabecera.
            try { i.nodo?.setPointerCapture?.(i.id); } catch { /* sin captura: sigue con los eventos que lleguen */ }
        }
        ultimo.current = { x: i.x + dx, y: i.y + dy };
        setArrastre(ultimo.current);
    }, []);

    const onPointerUp = useCallback(() => {
        const i = inicio.current;
        inicio.current = null;
        if (!i || !movio.current || !ultimo.current) return;
        const nueva = encajar({
            x: ultimo.current.x, y: ultimo.current.y, ancho: i.ancho, alto: i.alto,
            vw: window.innerWidth, vh: window.innerHeight,
        });
        ultimo.current = null;
        setArrastre(null);
        setPos(nueva);
        safeLocalStorageSet(CLAVE_BURBUJA_POS, JSON.stringify(nueva));
    }, []);

    /** Tras arrastrar, el `click` del final no es un toque. */
    const onClickCapture = useCallback((e) => {
        if (!movio.current) return;
        e.stopPropagation();
        e.preventDefault();
        movio.current = false;
    }, []);

    let estilo;
    if (arrastre) {
        estilo = { left: `${arrastre.x}px`, top: `${arrastre.y}px`, right: 'auto', bottom: 'auto', transition: 'none' };
    } else if (pos?.x != null) {
        estilo = { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' };
    } else if (pos) {
        // Guardada antes del 908 (solo lado y altura): pegada a ese borde, como entonces.
        estilo = pos.lado === 'izq'
            ? { left: `${BURBUJA_MARGEN}px`, right: 'auto', top: `${pos.y}px`, bottom: 'auto' }
            : { right: `${BURBUJA_MARGEN}px`, left: 'auto', top: `${pos.y}px`, bottom: 'auto' };
    }

    return {
        alMontar,
        estilo,
        lado: arrastre ? null : (pos?.lado || 'der'),
        arrastrando: Boolean(arrastre),
        manejadores: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture },
    };
}
