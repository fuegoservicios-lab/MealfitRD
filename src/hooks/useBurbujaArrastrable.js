// [P1-PLAN-LOTE-906 · 2026-09-29] La burbuja del modo voz se arrastra y se pega al borde.
//
// El dueño: «que esté en una posición cómoda que no estorbe cuando esté minimizado». Fija abajo a la derecha tapaba
// «Ver días anteriores» y la última comida del Progreso. Ahora se lleva con el dedo a donde moleste menos: al soltarla
// se pega al borde izquierdo o derecho más cercano (como las burbujas de chat del teléfono), sin salirse de la franja
// entre la cabecera y la barra de pestañas, y se recuerda en este dispositivo.
//
// Un arrastre no es un toque: si el dedo se movió, el `click` que sigue no llega a los botones de la burbuja.
import { useCallback, useEffect, useRef, useState } from 'react';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';

export const CLAVE_BURBUJA_POS = 'mealfit_voz_burbuja_pos';
export const BURBUJA_MARGEN = 12;
export const BURBUJA_ARRIBA = 72;    // debajo de la cabecera y la muesca
export const BURBUJA_ABAJO = 88;     // encima de la barra de pestañas
const UMBRAL_ARRASTRE = 8;

/** Dónde queda al soltarla: el borde más cercano y la altura dentro de la franja permitida. */
export function ajustarAlBorde({ x, y, ancho, alto, vw, vh, arriba = BURBUJA_ARRIBA, abajo = BURBUJA_ABAJO }) {
    const lado = x + ancho / 2 < vw / 2 ? 'izq' : 'der';
    const maxY = Math.max(arriba, vh - alto - abajo);
    return { lado, y: Math.round(Math.min(Math.max(y, arriba), maxY)) };
}

function leer() {
    try {
        const p = JSON.parse(safeLocalStorageGet(CLAVE_BURBUJA_POS, 'null'));
        if (p && (p.lado === 'izq' || p.lado === 'der') && Number.isFinite(p.y)) return { lado: p.lado, y: p.y };
    } catch { /* guardado ilegible: la posición de siempre */ }
    return null;
}

export function useBurbujaArrastrable() {
    const [pos, setPos] = useState(leer);            // { lado, y } | null = la esquina de siempre (CSS)
    const [arrastre, setArrastre] = useState(null);  // { x, y } mientras el dedo la lleva
    const ref = useRef(null);
    // Referencia de función (no el objeto `ref`): la regla `react-hooks/refs` no deja leer un ref durante el render.
    const alMontar = useCallback((nodo) => { ref.current = nodo; }, []);
    const inicio = useRef(null);
    const ultimo = useRef(null);
    const movio = useRef(false);

    // Si la ventana cambia (girar el teléfono, teclado), la altura guardada se vuelve a encajar.
    useEffect(() => {
        const alCambiar = () => setPos((p) => {
            if (!p) return p;
            const alto = ref.current?.getBoundingClientRect().height || 80;
            const maxY = Math.max(BURBUJA_ARRIBA, window.innerHeight - alto - BURBUJA_ABAJO);
            return p.y > maxY ? { ...p, y: maxY } : p;
        });
        window.addEventListener('resize', alCambiar);
        return () => window.removeEventListener('resize', alCambiar);
    }, []);

    const onPointerDown = useCallback((e) => {
        if (e.button !== undefined && e.button !== 0) return;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        inicio.current = { px: e.clientX, py: e.clientY, x: r.left, y: r.top, ancho: r.width, alto: r.height, id: e.pointerId };
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
            try { ref.current?.setPointerCapture?.(i.id); } catch { /* sin captura: sigue con los eventos que lleguen */ }
        }
        ultimo.current = { x: i.x + dx, y: i.y + dy };
        setArrastre(ultimo.current);
    }, []);

    const onPointerUp = useCallback(() => {
        const i = inicio.current;
        inicio.current = null;
        if (!i || !movio.current || !ultimo.current) return;
        const nueva = ajustarAlBorde({
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
    } else if (pos) {
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
