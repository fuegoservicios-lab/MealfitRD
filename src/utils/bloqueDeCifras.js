// [P1-PLAN-LOTE-1078 · 2026-11-18] Las cifras de la historia son un STICKER: se arrastran a donde quieras y se
// agrandan o achican pellizcando (el dueño: «que se pueda mover y agrande y volver más pequeño»). Aquí solo la
// geometría, sin lienzo: la caja de las cifras en el lienzo 1080×1920 (`historiaConFoto.cajaDeCifras`), cómo queda
// tras moverla/escalarla y los límites (la cabecera arriba y la zona que tapan Instagram/WhatsApp abajo).
//
// `bloque` = { dx, dy, escala }: desplazamiento del CENTRO de la caja en px del lienzo y escala alrededor de él.

export const BLOQUE_INICIAL = Object.freeze({ dx: 0, dy: 0, escala: 1 });
export const ESCALA_MIN = 0.45;
export const ESCALA_TOPE = 1.8;
const IMAN_PX = 24;           // a menos de esto del centro horizontal, se queda centrado

const _n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const _acotar = (v, a, b) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));

/** La escala más grande que cabe dentro de `limites` (nunca menos que 1: el tamaño de siempre siempre vale). */
export function escalaMax(caja, limites) {
    if (!(caja?.w > 0 && caja?.h > 0) || !limites) return 1;
    const porAncho = (limites.x1 - limites.x0) / caja.w;
    const porAlto = (limites.y1 - limites.y0) / caja.h;
    return Math.max(1, Math.min(ESCALA_TOPE, porAncho, porAlto));
}

/** El bloque dentro de sus límites: escala en [ESCALA_MIN, escalaMax] y la caja escalada sin salirse. */
export function acotarBloque(bloque, caja, limites) {
    const b = { ...BLOQUE_INICIAL, ...(bloque || {}) };
    if (!(caja?.w > 0 && caja?.h > 0) || !limites) return { ...BLOQUE_INICIAL };
    const escala = _acotar(_n(b.escala, 1), ESCALA_MIN, escalaMax(caja, limites));
    const cx = caja.x + caja.w / 2;
    const cy = caja.y + caja.h / 2;
    const mw = (caja.w * escala) / 2;
    const mh = (caja.h * escala) / 2;
    const dx = _acotar(_n(b.dx), limites.x0 + mw - cx, limites.x1 - mw - cx);
    const dy = _acotar(_n(b.dy), limites.y0 + mh - cy, limites.y1 - mh - cy);
    return { dx, dy, escala };
}

/** Tras arrastrar `dx`/`dy` px del lienzo o pellizcar `factor` veces (sin imán: ver `imantar`). */
export function moverBloque(bloque, caja, limites, { dx = 0, dy = 0, factor = 1 } = {}) {
    const b = acotarBloque(bloque, caja, limites);
    return acotarBloque({ dx: b.dx + _n(dx), dy: b.dy + _n(dy), escala: b.escala * (_n(factor, 1) || 1) }, caja, limites);
}

/** Cerca del centro horizontal, centrado (el imán). Se aplica a la posición «cruda» del dedo, no a la ya imantada:
 *  si no, un arrastre lento nunca saldría del centro. */
export function imantar(bloque) {
    return Math.abs(_n(bloque?.dx)) < IMAN_PX ? { ...bloque, dx: 0 } : bloque;
}

/** La caja tal como queda en el lienzo con ese bloque. */
export function cajaTransformada(caja, bloque) {
    const b = { ...BLOQUE_INICIAL, ...(bloque || {}) };
    const w = caja.w * b.escala;
    const h = caja.h * b.escala;
    return { x: caja.x + caja.w / 2 + b.dx - w / 2, y: caja.y + caja.h / 2 + b.dy - h / 2, w, h };
}

/** ¿El punto (px del lienzo) cae sobre las cifras? Con margen: un dedo no es un píxel. */
export function tocaLasCifras(caja, bloque, x, y, margen = 36) {
    if (!caja) return false;
    const c = cajaTransformada(caja, bloque);
    return x >= c.x - margen && x <= c.x + c.w + margen && y >= c.y - margen && y <= c.y + c.h + margen;
}

/** Aplica el bloque al contexto: lo que se pinte después (en las coordenadas de siempre) sale movido y escalado. */
export function aplicarBloque(ctx, caja, bloque) {
    const b = { ...BLOQUE_INICIAL, ...(bloque || {}) };
    const cx = caja.x + caja.w / 2;
    const cy = caja.y + caja.h / 2;
    ctx.translate(cx + b.dx, cy + b.dy);
    ctx.scale(b.escala, b.escala);
    ctx.translate(-cx, -cy);
}

export const esInicial = (b) => !b || (Math.abs(_n(b.dx)) < 0.5 && Math.abs(_n(b.dy)) < 0.5 && Math.abs(_n(b.escala, 1) - 1) < 0.005);
