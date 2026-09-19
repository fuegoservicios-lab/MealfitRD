// [P1-PLAN-LOTE-106 · 2026-09-18] La hoja inferior del teléfono, como HOOK: lo que el componedor («Registrar
// comida», lotes 99-101) hacía en línea, extraído para que el escáner de fotos se comporte IGUAL. Se extrae, no
// se copia — el precedente es CameraViewfinder (P1-SCANNER-SHARED): una copia garantiza que el próximo ajuste
// entre en una hoja y la otra siga emitiendo lo viejo.
//
// Tres cosas, todas medidas en el iPhone del dueño:
//  1. [P1-PLAN-LOTE-101] El toque no pasa al fondo: un `touchmove` no pasivo sobre el panel cancela lo que el
//     cuerpo desplazable no puede consumir (arriba del todo bajando, abajo del todo subiendo, o sin scroll).
//  2. [P1-PLAN-LOTE-101] Deslizar hacia abajo cierra (como los menús de actualizar platos): la hoja sigue al dedo
//     desde 8 px si el cuerpo está arriba; si el dedo sube o el cuerpo no está arriba, el gesto es del scroll, y si
//     el scroll llega arriba con el dedo aún bajando, la hoja toma el relevo. Cierra con 70 px, un flick corto o lo
//     recorrido más la inercia proyectada.
//  3. [P1-PLAN-LOTE-100] «Al cerrar se scrollea un poco hacia abajo»: iOS desplaza el DOCUMENTO de fondo para
//     revelar el campo enfocado aunque el body lleve `overflow: hidden`. Se recuerda el scroll al abrir y se
//     restaura al desmontar (y en cuanto el visual viewport recupera su alto, por si el teclado se cierra antes).
//
// Uso: `const hoja = useBottomSheet({ containerRef, bodyRef, onClose, disabled });` y en el panel
// `onTouchStart={hoja.onTouchStart} onTouchMove={hoja.onTouchMove} onTouchEnd={hoja.onTouchEnd}
//  onTouchCancel={hoja.onTouchEnd}`. `disabled` (guardando, subiendo) apaga el gesto, no el bloqueo del fondo.
import { useEffect, useRef } from 'react';

const enTelefono = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;

export function useBottomSheet({ containerRef, bodyRef, onClose, disabled = false }) {
    const gestureRef = useRef({ y0: null, active: false, ceded: false, off: 8, lastY: 0, lastT: 0, vy: 0 });
    const cerrandoRef = useRef(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;
        const block = (e) => {
            const g = gestureRef.current;
            if (g.y0 == null || !e.cancelable) return;
            if (g.active) { e.preventDefault(); return; }
            const sc = bodyRef.current;
            const t = e.touches[0];
            if (!sc || !sc.contains(e.target)) { e.preventDefault(); return; }
            const scrollable = sc.scrollHeight > sc.clientHeight + 1;
            if (!scrollable) { e.preventDefault(); return; }
            const dir = t.clientY - g.y0;
            const atTop = sc.scrollTop <= 0;
            const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
            if ((dir > 0 && atTop) || (dir < 0 && atBottom)) e.preventDefault();
        };
        el.addEventListener('touchmove', block, { passive: false });
        return () => el.removeEventListener('touchmove', block);
    }, [containerRef, bodyRef]);

    const moverHoja = (y, animar) => {
        const el = containerRef.current;
        if (!el) return;
        el.style.transition = animar ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
        el.style.transform = y ? `translateY(${y}px)` : '';
    };
    const onTouchStart = (e) => {
        if (!enTelefono() || disabled || cerrandoRef.current) return;
        const t = e.touches[0];
        gestureRef.current = { y0: t.clientY, active: false, ceded: false, off: 8, lastY: t.clientY, lastT: e.timeStamp, vy: 0 };
    };
    const onTouchMove = (e) => {
        const g = gestureRef.current;
        if (g.y0 == null) return;
        const t = e.touches[0];
        const sc = bodyRef.current;
        const atTop = !sc || sc.scrollTop <= 0;
        if (!g.active) {
            if (g.ceded) {
                // el scroll llevaba el gesto; si el cuerpo ya está arriba y el dedo sigue bajando, relevo
                if (atTop && t.clientY - g.lastY > 0) { g.y0 = t.clientY; g.off = 0; g.ceded = false; g.active = true; }
                else { g.lastY = t.clientY; g.lastT = e.timeStamp; return; }
            } else {
                const dy0 = t.clientY - g.y0;
                if (dy0 > 8 && atTop) g.active = true;
                else if (Math.abs(dy0) > 8) { g.ceded = true; g.lastY = t.clientY; g.lastT = e.timeStamp; return; }
                else return;
            }
        }
        const dt = Math.max(1, e.timeStamp - g.lastT);
        g.vy = (t.clientY - g.lastY) / dt;
        g.lastY = t.clientY;
        g.lastT = e.timeStamp;
        moverHoja(Math.max(0, t.clientY - g.y0 - g.off), false);
    };
    const onTouchEnd = () => {
        const g = gestureRef.current;
        const wasActive = g.active;
        const y = wasActive ? Math.max(0, g.lastY - g.y0 - g.off) : 0;
        const vy = g.vy;
        gestureRef.current = { y0: null, active: false, ceded: false, off: 8, lastY: 0, lastT: 0, vy: 0 };
        if (!wasActive) return;
        // cierra con poco: 70 px, o un flick corto, o lo recorrido más la inercia proyectada (150 ms)
        if (y > 70 || vy > 0.35 || y + vy * 150 > 100) {
            cerrandoRef.current = true;
            const el = containerRef.current;
            if (el) { el.style.transition = 'transform 0.18s ease-in'; el.style.transform = 'translateY(110%)'; }
            setTimeout(onClose, 170);
        } else {
            moverHoja(0, true);
        }
    };

    // [P1-PLAN-LOTE-100] el scroll del documento vuelve a donde estaba al cerrar la hoja
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const scrollY0 = window.scrollY;
        const restaurarScroll = () => {
            if (Math.abs(window.scrollY - scrollY0) > 1) window.scrollTo(0, scrollY0);
        };
        const vv = window.visualViewport;
        if (!vv) {
            return () => {
                restaurarScroll();
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restaurarScroll);
            };
        }
        const alto0 = vv.height;
        const alCambiar = () => { if (vv.height >= alto0 - 1) restaurarScroll(); };
        vv.addEventListener('resize', alCambiar);
        return () => {
            vv.removeEventListener('resize', alCambiar);
            restaurarScroll();
            // [P1-PLAN-LOTE-101] y un frame después: el desplazamiento que provoca devolver el foco puede
            // llegar tras esta limpieza.
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restaurarScroll);
        };
    }, []);

    return { onTouchStart, onTouchMove, onTouchEnd };
}

export default useBottomSheet;
