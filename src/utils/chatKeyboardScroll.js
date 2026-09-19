// [P1-PLAN-LOTE-115 · 2026-09-19] El chat con el teclado abierto: qué se ve y qué no se mueve.
//
// Dos decisiones PURAS que usa AgentPage, sacadas aquí para poder probarlas sin navegador.
//
// 1) AL ABRIR EL TECLADO, ¿SE TRAE EL FINAL DE LA CONVERSACIÓN A CUADRO?
//    El dueño: «si no puede ver el mensaje del agente mientras el teclado está abierto, ¿no es peor? ¿qué va a
//    responder?». Tenía razón, y el hueco era el modo ANCLADO: tras enviar, el mensaje del usuario queda arriba y la
//    respuesta crece debajo (P2-CHAT-ANCHOR-SENT-TOP); al abrir el teclado la ventana pierde 403 px POR ABAJO, que es
//    justo donde está el final de la respuesta —la pregunta que el agente acaba de hacer—. `scrollToBottom` sin
//    `force` no hace nada en ese modo, así que el teclado tapaba lo que había que contestar.
//      · 'bottom'   → 'fijar'  (ya estaba abajo: se mantiene pegado mientras la ventana encoge)
//      · respuesta EN CURSO → 'nada' (manda el ancla: se está leyendo el principio de la respuesta)
//      · 'anchored' con la respuesta terminada → 'forzar' (suelta el ancla y baja al final)
//      · 'free' a menos de UNA pantalla del final real → 'forzar'; más arriba → 'nada': quien lee historial antiguo
//        no es arrastrado al final por tocar la caja (así lo hacen ChatGPT y Gemini). Su posición se conserva
//        respecto al borde INFERIOR (eso lo hace el ResizeObserver del contenedor).
export function decidirScrollAlAbrirTeclado({
    mode = 'bottom', streaming = false, virtualizada = false,
    scrollHeight = 0, scrollTop = 0, clientHeight = 0, spacerPx = 0,
} = {}) {
    if (mode === 'bottom') return 'fijar';
    if (streaming) return 'nada';
    if (mode === 'anchored') return 'forzar';
    if (virtualizada) return 'nada';
    const finReal = Math.max(0, scrollHeight - Math.max(0, spacerPx));
    const distancia = finReal - (scrollTop + clientHeight);
    return distancia <= clientHeight ? 'forzar' : 'nada';
}

// 2) CON EL TECLADO ABIERTO (app nativa), ¿ESTE ARRASTRE SE BLOQUEA?
//    MEDIDO con la sonda: un toque en la caja de escribir seguido de `scroll` del visual viewport con el paneo
//    subiendo 19 → 38 → 56 → 73 → 86 px en 60 ms y volviendo a 0 de golpe. Con el teclado en pantalla el WebView deja
//    ARRASTRAR la página entera cuando el dedo cae donde nada puede desplazarse; nuestro ajuste perseguía ese paneo
//    con 250 ms de transición y la caja se despegaba del teclado y volvía: los «errores visuales».
//    Se bloquea el arrastre que NADIE puede aprovechar. Se cede siempre: el gesto horizontal (la fila de
//    sugerencias), el que cae sobre un scroller que aún puede moverse en esa dirección (el historial, un mensaje
//    largo en la caja), y el arrastre LENTO dentro de un campo de texto (mover el cursor / seleccionar).
export const TOQUE_UMBRAL_PX = 6;
export const TOQUE_LENTO_MS = 250;

export function decidirArrastreConTeclado({ dx = 0, dy = 0, msDesdeElToque = 0, enCampoDeTexto = false, scrollerPuede = false } = {}) {
    if (Math.abs(dx) < TOQUE_UMBRAL_PX && Math.abs(dy) < TOQUE_UMBRAL_PX) return 'esperar';
    if (Math.abs(dx) > Math.abs(dy)) return 'ceder';
    if (scrollerPuede) return 'ceder';
    if (enCampoDeTexto && msDesdeElToque > TOQUE_LENTO_MS) return 'ceder';
    return 'bloquear';
}

/** ¿Hay, entre `desde` y `hasta`, un scroller vertical que aún pueda moverse en la dirección del dedo? */
export function scrollerPuedeMoverse(desde, hasta, dy, estiloDe = (n) => getComputedStyle(n)) {
    let n = desde;
    while (n && n !== hasta && n.nodeType === 1) {
        if (n.scrollHeight > n.clientHeight + 1) {
            const oy = estiloDe(n).overflowY;
            if (oy === 'auto' || oy === 'scroll') {
                const arriba = n.scrollTop <= 0;
                const abajo = n.scrollTop + n.clientHeight >= n.scrollHeight - 1;
                // dedo hacia abajo (dy>0) = ver contenido de más arriba
                if ((dy > 0 && !arriba) || (dy < 0 && !abajo)) return true;
            }
        }
        n = n.parentElement;
    }
    return false;
}
