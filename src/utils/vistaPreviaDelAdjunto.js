// [P1-PLAN-LOTE-360 · 2026-09-26] Qué pinta la caja del chat para una foto adjunta.
//
// La miniatura (360 px, la hace el worker) siempre que exista. Mientras no existe:
//   · fuera de iOS, la foto grande al instante (`previewUrl`, lote 138): el navegador la decodifica fuera del hilo
//     principal y el usuario la ve en cuanto la elige;
//   · en iOS (app y Safari) NADA grande: WebKit de iOS la decodifica en el hilo principal, y al volver de la galería
//     eso congeló el teléfono 769 ms en plena subida del teclado (sonda del dueño, 26-sep). Un hueco hasta la miniatura.
// Una foto ya lista SIN miniatura (un borrador restaurado) se pinta grande también en iOS: ya no compite con nada.

/** ¿Motor de iOS? La app nativa de iPhone o Safari/cualquier navegador en iPhone/iPad (todos son WebKit ahí). */
export function esIOS(nav = typeof navigator !== 'undefined' ? navigator : null, esAppNativa = false) {
    if (esAppNativa && /iP(hone|ad|od)|Macintosh/.test(nav?.userAgent || '') && (nav?.maxTouchPoints || 0) > 1) return true;
    const ua = nav?.userAgent || '';
    if (/iP(hone|ad|od)/.test(ua)) return true;
    // iPadOS se anuncia como Mac: con pantalla táctil, es un iPad.
    return /Macintosh/.test(ua) && (nav?.maxTouchPoints || 0) > 1;
}

export function vistaPreviaDelAdjunto(item, { ios = false, rota = false } = {}) {
    if (!item || item.status === 'error') return null;
    if (item.thumbDataUrl) return item.thumbDataUrl;
    if (!item.previewUrl || rota) return null;
    if (ios && item.status !== 'ready') return null;
    return item.previewUrl;
}
