// [P1-PLAN-LOTE-118 · 2026-09-19] La barra de pestañas se puede PLEGAR.
//
// El dueño: «crea algo desplegable para poder cerrar el menú para abajo y así tener más espacio en el chat… no puede
// estorbar y tiene que cerrarse como el menú de actualizar platos». En el teléfono la barra ocupa 64 px fijos; en el
// chat, con la caja de escribir encima, es la diferencia entre ver tres líneas de la respuesta o cinco.
//
// CÓMO SE COMPORTA
//  · Se pliega DESLIZÁNDOLA hacia abajo (sigue al dedo, como una hoja inferior) o tocando el asa de su borde superior.
//  · Plegada NO desaparece: queda una franja de 22 px con el asa, encima de la zona del indicador de inicio de iOS
//    (un gesto hacia arriba pegado al borde inferior es «ir a inicio»: por eso la franja no vive ahí). Tocarla o
//    deslizarla hacia arriba la devuelve. La navegación nunca queda escondida sin una puerta visible.
//  · La elección se recuerda en el dispositivo y vale para todo el dashboard: una barra, un estado.
//  · El espacio se DEVUELVE: `html[data-tabbar-plegada]` sube `--tabbar-recupera` y todo lo que reservaba sitio para
//    la barra (el contenido de cada página, la caja del chat, el cajón de conversaciones, el aviso «sin conexión») lo
//    resta. Con el teclado abierto manda la regla de siempre (`html[data-kb-open]`): la barra se va entera.
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/safeLocalStorage';

export const CLAVE_TABBAR_PLEGADA = 'mf_tabbar_plegada';
export const UMBRAL_PLEGAR_PX = 26;
const UMBRAL_VELOCIDAD = 0.35; // px/ms

/** Decisión PURA al soltar el dedo. `dy` > 0 = hacia abajo. */
export function decidirAlSoltar({ plegada, dy = 0, vy = 0 }) {
    if (!plegada) return dy > UMBRAL_PLEGAR_PX || vy > UMBRAL_VELOCIDAD ? 'plegar' : 'quedarse';
    return dy < -UMBRAL_PLEGAR_PX || vy < -UMBRAL_VELOCIDAD ? 'desplegar' : 'quedarse';
}

export function useTabBarPlegable(navRef) {
    const [plegada, setPlegada] = useState(() => safeLocalStorageGet(CLAVE_TABBAR_PLEGADA, null) === '1');
    const gesto = useRef(null);
    const arrastroRef = useRef(false);

    useLayoutEffect(() => {
        const root = document.documentElement;
        root.toggleAttribute('data-tabbar-plegada', plegada);
        return () => root.removeAttribute('data-tabbar-plegada');
    }, [plegada]);

    const fijar = useCallback((valor) => {
        setPlegada(valor);
        if (valor) safeLocalStorageSet(CLAVE_TABBAR_PLEGADA, '1');
        else safeLocalStorageRemove(CLAVE_TABBAR_PLEGADA);
        try { navigator.vibrate?.(10); } catch { /* sin háptica */ }
    }, []);

    const soltarEstilo = () => {
        const el = navRef.current;
        if (!el) return;
        el.style.transition = '';
        el.style.transform = '';
    };

    const onTouchStart = (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        gesto.current = { x0: t.clientX, y0: t.clientY, y: t.clientY, t: e.timeStamp, vy: 0, vertical: null };
        arrastroRef.current = false;
    };
    const onTouchMove = (e) => {
        const g = gesto.current;
        if (!g) return;
        const t = e.touches[0];
        const dx = t.clientX - g.x0;
        const dy = t.clientY - g.y0;
        if (g.vertical === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            g.vertical = Math.abs(dy) > Math.abs(dx);
        }
        if (!g.vertical) return;
        arrastroRef.current = true;
        const dt = Math.max(1, e.timeStamp - g.t);
        g.vy = (t.clientY - g.y) / dt;
        g.y = t.clientY;
        g.t = e.timeStamp;
        // La barra sigue al dedo solo en el sentido útil: abierta baja, plegada sube.
        const el = navRef.current;
        if (!el) return;
        const recorrido = plegada ? Math.min(0, dy) : Math.max(0, dy);
        el.style.transition = 'none';
        el.style.transform = plegada
            ? `translateY(calc(100% - var(--tabbar-asa) - env(safe-area-inset-bottom, 0px) + ${recorrido}px))`
            : `translateY(${recorrido}px)`;
    };
    const onTouchEnd = () => {
        const g = gesto.current;
        gesto.current = null;
        if (!g || !g.vertical) return;
        const accion = decidirAlSoltar({ plegada, dy: g.y - g.y0, vy: g.vy });
        soltarEstilo();
        if (accion === 'plegar') fijar(true);
        else if (accion === 'desplegar') fijar(false);
    };
    // Un arrastre que empieza sobre una pestaña no es un toque en esa pestaña.
    const onClickCapture = (e) => {
        if (!arrastroRef.current) return;
        arrastroRef.current = false;
        e.preventDefault();
        e.stopPropagation();
    };

    return {
        plegada,
        alternar: () => fijar(!plegada),
        gestos: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, onClickCapture },
    };
}
