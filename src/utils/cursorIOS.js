// [P1-PLAN-LOTE-1052 · 2026-11-16] iOS deja el cursor (el caret) del cuadro de escribir pintado donde ESTABA.
//
// Capturas del dueño: tras abrir y cerrar el «+» varias veces, la rayita azul salía ~55 px por encima de la línea de
// escribir, o encima de «Galería». WebKit en iOS coloca el caret de un campo enfocado en una capa aparte y no la
// recoloca cuando el campo se MUEVE sin teclear: aquí lo mueven el `translateY` con que el chat sube la caja al abrirse
// el teclado y el `--kb-inset` que cambia mientras el teclado se anima. Cualquier tecla lo arregla; nosotros no podemos
// teclear por él.
//
// El remedio: cuando la caja deja de moverse (`ms` después del ÚLTIMO cambio), darle al campo una capa propia un
// fotograma (WebKit rehace la del caret) y volver a fijar su misma selección. No mueve el foco, no cierra el teclado
// (nada de blur/focus, que sí lo cerraría) y no cambia el texto. Fuera de iOS no hace nada.
import { esIOS } from './vistaPreviaDelAdjunto';

let temporizador = null;

/** Recoloca YA el caret de `campo` si está enfocado (iOS). Devuelve true si lo hizo. */
export function refrescarCursor(campo, { ios = esIOS() } = {}) {
    if (!ios || !campo || typeof document === 'undefined' || document.activeElement !== campo) return false;
    const inicio = campo.selectionStart;
    const fin = campo.selectionEnd;
    const sentido = campo.selectionDirection || 'none';
    campo.style.webkitTransform = 'translateZ(0)';
    void campo.offsetHeight;                       // que WebKit pinte la capa nueva antes de quitarla
    const quitar = () => {
        campo.style.webkitTransform = '';
        try {
            if (document.activeElement === campo && inicio !== null) campo.setSelectionRange(inicio, fin, sentido);
        } catch { /* un campo sin selección (otro tipo) no la admite */ }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(quitar); else quitar();
    return true;
}

/** Lo mismo, pero `ms` después del ÚLTIMO aviso: durante la animación del teclado llegan decenas seguidos. */
export function programarRefrescoDelCursor(obtenerCampo, ms = 320, opciones = {}) {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => {
        temporizador = null;
        refrescarCursor(typeof obtenerCampo === 'function' ? obtenerCampo() : obtenerCampo, opciones);
    }, ms);
}
