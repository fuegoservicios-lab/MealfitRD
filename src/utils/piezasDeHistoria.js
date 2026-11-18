// [P1-PLAN-LOTE-1084 · 2026-11-18] Los textos sueltos de la historia son piezas que se mueven y se quitan (el dueño:
// «que se puedan mover bioboros.com, ¿y tú cómo vas?, la fecha… y eliminar al gusto personal»). Aquí la geometría y el
// dibujo de cada pieza, sin lienzo propio: quien pinta pasa su pincel (`historiaConFoto.PINCEL` + `medir`), así este
// módulo no importa al que lo usa.
//
// `piezas` = { [id]: { dx, dy, oculta } } en px del lienzo 1080×1920; lo que no está, en su sitio y visible.
// Ids: `marca` (el brote y la marca, arriba), `fecha` (arriba a la derecha), `sitio` (el dominio), `pregunta`
// («¿Y tú, cómo vas hoy?»), `sello` (la marca centrada abajo, del estilo Minimal).

export const PIEZA_INICIAL = Object.freeze({ dx: 0, dy: 0, oculta: false });

const _n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const estadoDePieza = (piezas, id) => ({ ...PIEZA_INICIAL, ...((piezas && piezas[id]) || {}) });

/** Las piezas de un estilo, en su sitio de siempre: `{ id, pie, caja, pintar(ctx) }` (caja en px del lienzo). */
export function definirPiezas(r, estilo, P, medir) {
    const { M, BASE, SEGURO, ANCHO, CLARO, TENUE, BLANCO } = P;
    const y = SEGURO.arriba;
    const caja = (x, base, w, tam) => ({ x, y: base - tam * 0.86, w, h: tam * 1.12 });
    const marca = String(P.MARCA).toUpperCase();
    const anchoMarca = medir(marca, 32, 800);
    const fecha = String(r?.periodo || P.fechaLarga(r?.fecha));
    const anchoFecha = Math.min(medir(fecha, 28, 600), ANCHO / 2);
    const lista = [
        {
            id: 'marca', pie: false, caja: { x: M, y: y - 46, w: 62 + anchoMarca, h: 56 },
            pintar: (ctx) => { P.brote(ctx, M, y - 42, 50, BLANCO); P.texto(ctx, marca, M + 62, y, { tam: 32, peso: 800 }); },
        },
        {
            id: 'fecha', pie: false, caja: caja(ANCHO - M - anchoFecha, y, anchoFecha, 28),
            pintar: (ctx) => P.texto(ctx, fecha, ANCHO - M, y, { tam: 28, peso: 600, color: CLARO, alinear: 'right', max: ANCHO / 2 }),
        },
    ];
    if (estilo === 'minimal') {
        const marcaPie = String(P.MARCA).toUpperCase();
        const ancho = medir(marcaPie, 30, 800) + 52;
        const x0 = ANCHO / 2 - ancho / 2;
        lista.push({
            id: 'sello', pie: true, caja: { x: x0, y: BASE - 40, w: ancho, h: 48 },
            pintar: (ctx) => { P.brote(ctx, x0, BASE - 36, 42, BLANCO); P.texto(ctx, marcaPie, x0 + 52, BASE, { tam: 30, peso: 800 }); },
        });
    } else if (estilo === 'cristal') {
        const w = medir(P.SITIO, 30, 700);
        lista.push({
            id: 'sitio', pie: true, caja: caja(ANCHO / 2 - w / 2, BASE, w, 30),
            pintar: (ctx) => P.texto(ctx, P.SITIO, ANCHO / 2, BASE, { tam: 30, peso: 700, color: CLARO, alinear: 'center' }),
        });
    } else {
        const w = medir(P.SITIO, 30, 700);
        const pregunta = String(r?.pregunta || P.preguntaDelDia());
        const wp = Math.min(medir(pregunta, 30, 600), ANCHO / 2);
        lista.push(
            {
                id: 'sitio', pie: true, caja: caja(M, BASE, w, 30),
                pintar: (ctx) => P.texto(ctx, P.SITIO, M, BASE, { tam: 30, peso: 700, color: TENUE }),
            },
            {
                id: 'pregunta', pie: true, caja: caja(ANCHO - M - wp, BASE, wp, 30),
                pintar: (ctx) => P.texto(ctx, pregunta, ANCHO - M, BASE, { tam: 30, peso: 600, color: TENUE, alinear: 'right', max: ANCHO / 2 }),
            },
        );
    }
    return lista;
}

/** La caja de una pieza tal como queda movida. */
export const cajaDePieza = (def, piezas) => {
    const p = estadoDePieza(piezas, def.id);
    return { ...def.caja, x: def.caja.x + p.dx, y: def.caja.y + p.dy };
};

/** `piezas` con la pieza `id` movida `dx`/`dy`, sin salirse del lienzo. */
export function moverPieza(piezas, def, { dx = 0, dy = 0 } = {}, ancho = 1080, alto = 1920) {
    const p = estadoDePieza(piezas, def.id);
    const c = def.caja;
    // [P1-PLAN-LOTE-1097] libres como el resumen: solo el CENTRO del texto se queda dentro de la imagen
    const nx = Math.max(-c.x - c.w / 2, Math.min(ancho - c.x - c.w / 2, p.dx + _n(dx)));
    const ny = Math.max(-c.y - c.h / 2, Math.min(alto - c.y - c.h / 2, p.dy + _n(dy)));
    return { ...(piezas || {}), [def.id]: { ...p, dx: nx, dy: ny } };
}

/** `piezas` con la pieza `id` mostrada u oculta. */
export const alternarPieza = (piezas, id) => {
    const p = estadoDePieza(piezas, id);
    return { ...(piezas || {}), [id]: { ...p, oculta: !p.oculta } };
};

/** Todas en su sitio (las ocultas siguen ocultas). */
export const piezasEnSuSitio = (piezas) => Object.fromEntries(
    Object.entries(piezas || {}).map(([id, p]) => [id, { ...PIEZA_INICIAL, oculta: !!p?.oculta }]),
);

export const piezasMovidas = (piezas) => Object.values(piezas || {}).some((p) => Math.abs(_n(p?.dx)) > 0.5 || Math.abs(_n(p?.dy)) > 0.5);

/** La pieza VISIBLE bajo el punto (px del lienzo), con margen de dedo; la última definida gana. */
export function piezaEn(defs, piezas, x, y, margen = 30) {
    for (let i = defs.length - 1; i >= 0; i -= 1) {
        const d = defs[i];
        if (estadoDePieza(piezas, d.id).oculta) continue;
        const c = cajaDePieza(d, piezas);
        if (x >= c.x - margen && x <= c.x + c.w + margen && y >= c.y - margen && y <= c.y + c.h + margen) return d.id;
    }
    return null;
}

/** Pinta las piezas visibles, cada una con su desplazamiento. */
export function pintarPiezas(ctx, defs, piezas) {
    defs.forEach((d) => {
        const p = estadoDePieza(piezas, d.id);
        if (p.oculta) return;
        ctx.save();
        ctx.translate(p.dx, p.dy);
        d.pintar(ctx);
        ctx.restore();
    });
}
