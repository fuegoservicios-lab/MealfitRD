// [P2-CHAT-TEXTAREA-AUTOSIZE · 2026-07-24] SSOT del auto-resize del textarea
// del chat.
//
// Bug cerrado (reportado 2026-07-24): "el chat del agente su tamaño se buguea
// a veces y se pone ancho, tengo que refrescar la página para que vuelva a su
// tamaño normal". La altura se escribía imperativamente SOLO desde el handler
// `onInput` del DOM. React no es dueño de ese `height` inline (no viaja en el
// prop `style`), así que no lo revierte en el re-render: cualquier cambio de
// valor que NO venga de una tecla (enviar → `setInput('')`, chat nuevo, pill
// de sugerencia, prefill) dejaba pegada la altura del mensaje anterior. Y como
// AgentPage es keep-alive (se oculta con `display:none`, nunca se desmonta),
// la altura stale sobrevivía a la navegación — solo un reload la reseteaba.
//
// Contrato nuevo: la altura es FUNCIÓN del estado, no efecto colateral de un
// evento. `useAutosizeTextarea` re-mide en cada commit donde cambia la firma
// (valor + lo que altere el ancho disponible) y ante `resize` de la ventana.
import { useEffect, useLayoutEffect, useRef } from 'react';

/** Techo del auto-resize: ≈5 líneas; a partir de ahí, scroll interno. */
export const CHAT_TEXTAREA_MAX_HEIGHT_PX = 120;

/**
 * Ajusta la altura del textarea a su contenido, topada en `maxHeightPx`.
 *
 * Idempotente: `height='auto'` antes de medir hace que ENCOGER funcione igual
 * que crecer (sin el reset, `scrollHeight` nunca baja de la altura ya fijada).
 *
 * @param {HTMLTextAreaElement|null|undefined} el
 * @param {number} [maxHeightPx]
 */
export function autosizeTextarea(el, maxHeightPx = CHAT_TEXTAREA_MAX_HEIGHT_PX) {
    if (!el || typeof el.scrollHeight !== 'number') return;
    const prev = el.style.height;
    el.style.height = 'auto';
    const measured = el.scrollHeight;
    // measured === 0 ⇒ el elemento no está renderizado (AgentPage oculto por
    // el keep-alive de App.jsx, o el tab en background). Medir ahí escribiría
    // `0px` y dejaría el input colapsado al volver: restauramos y salimos.
    // El siguiente commit visible (o el `resize`) vuelve a medir bien.
    if (measured <= 0) {
        el.style.height = prev;
        return;
    }
    el.style.height = `${Math.min(measured, maxHeightPx)}px`;
}

/**
 * Mantiene el textarea dimensionado a su contenido.
 *
 * @param {{current: HTMLTextAreaElement|null}} ref  Ref al textarea.
 * @param {unknown} signature  Cambia cuando cambia el CONTENIDO o el ANCHO
 *   disponible (p.ej. `` `${input}|${isMobile}|${showSidebar}` ``). Un solo
 *   valor escalar mantiene el array de deps estable para el linter.
 * @param {number} [maxHeightPx]
 */
/**
 * [P1-PLAN-LOTE-1055 · 2026-11-17] ¿Basta con MIRAR? Al teclear al final, el texto solo puede crecer: si con el mismo
 * ancho todavía cabe en la altura que ya tiene, no hay nada que cambiar. `autosizeTextarea` pone `height:auto` para
 * poder medir, y eso descoloca toda la página dos veces por tecla (una al medir y otra al devolverle la altura): en el
 * arnés de producción era el 28 % del trabajo de cada tecla. Aquí solo se lee; cualquier otro caso (borrar, enviar, pegar
 * en medio, otro ancho, no cabe) va por el camino completo de siempre.
 */
function bastaConMirar(el, previo) {
    if (!el || !previo || !el.style.height) return false;
    const valor = el.value;
    if (valor.length < previo.valor.length || !valor.startsWith(previo.valor)) return false;
    if (el.clientWidth !== previo.ancho) return false;
    return el.scrollHeight <= el.clientHeight;
}

export function useAutosizeTextarea(ref, signature, maxHeightPx = CHAT_TEXTAREA_MAX_HEIGHT_PX) {
    const previoRef = useRef(null);
    // useLayoutEffect: la remedida ocurre antes del paint → cero flicker al
    // teclear (el usuario nunca ve el frame con la altura vieja).
    useLayoutEffect(() => {
        const el = ref.current;
        if (!bastaConMirar(el, previoRef.current)) autosizeTextarea(el, maxHeightPx);
        previoRef.current = el ? { valor: el.value, ancho: el.clientWidth } : null;
    }, [ref, signature, maxHeightPx]);

    // Rotación del dispositivo / redimensionar la ventana cambian cuántas
    // líneas ocupa el mismo texto. Sin esto, la caja queda con la altura del
    // ancho anterior hasta la siguiente tecla.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onResize = () => autosizeTextarea(ref.current, maxHeightPx);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [ref, maxHeightPx]);
}
