// [P1-PLAN-LOTE-1132 · 2026-11-20] «Compartir mi camino»: el mapa de niveles como historia (idea propuesta al cerrar el
// 1131; el dueño: «y las ideas tuyas también»). La MISMA historia que el día, la semana y el mes (tu foto de fondo, los
// siete diseños, el sticker que se mueve) con lo del camino: el día en que vas, las estrellas, la racha, el mundo
// (rango) y los últimos 14 niveles serpenteando como en el mapa. Sin kcal ni macros (como la semana y el mes).
import { t, tn, formatNumber } from '../i18n';
import { BRAND } from '../data/routeMeta';
import { SITIO } from './compartirDia';
import { PINCEL } from './historiaConFoto';

export const NIVELES_EN_LA_HISTORIA = 14;
const POR_FILA = 7;
const ESTADOS = new Set(['meta', 'bajo', 'sobre', 'vacio', 'futuro']);
const NOMBRE_MUNDO = () => ({ bronce: t('Bronce'), plata: t('Plata'), oro: t('Oro'), platino: t('Platino'), diamante: t('Diamante') });
const { COLOR, M, BASE, BLANCO, CLARO, CRISTAL } = PINCEL;
const ANCHO = 1080;
// Tinta fija (JPEG, no interfaz): la de los anillos de la semana; el coral en rgb() (el trinquete de hex es de la UI).
const TONO = { meta: COLOR.carbs, bajo: COLOR.calories, sobre: ['rgb(251, 113, 133)', 'rgb(239, 68, 68)'] };
const ORO = COLOR.calories;

/**
 * `mapa` = lo que el mapa ya tiene pintado: `{ nivelHoy, estrellas, racha, mundo: 'plata', dias: [{ iso, estado, esHoy }] }`
 * (`dias` de lo más VIEJO a lo más nuevo; se quedan los 14 últimos hasta hoy).
 */
export function resumenDeMapa(mapa) {
    const m = mapa || {};
    const dias = (Array.isArray(m.dias) ? m.dias : [])
        .filter((d) => d && d.estado !== 'futuro')
        .slice(-NIVELES_EN_LA_HISTORIA)
        .map((d) => ({ iso: String(d.iso || ''), estado: ESTADOS.has(d.estado) ? d.estado : 'vacio', esHoy: !!d.esHoy }));
    const nombres = NOMBRE_MUNDO();
    const clave = nombres[m.mundo] ? m.mundo : 'bronce';
    const nivel = Math.max(1, Number(m.nivelHoy) || 1);
    const mundo = { clave, nombre: nombres[clave] };
    return {
        tipo: 'mapa',
        nivel,
        estrellas: Math.max(0, Number(m.estrellas) || 0),
        racha: Math.max(0, Number(m.racha) || 0),
        mundo,
        dias,
        enMeta: dias.filter((d) => d.estado === 'meta').length,
        periodo: `${t('Día {n}', { n: formatNumber(nivel) })} · ${t('Mundo {nombre}', { nombre: mundo.nombre })}`,
        pregunta: t('¿Y tú, cómo va tu camino?'),
        perfecta: false,
        pintor: PINTOR_MAPA,
    };
}

const _EMOJI = { meta: '✅', bajo: '🟡', sobre: '🟠', vacio: '⚪' };

/** El mensaje para WhatsApp (la reserva sin imagen). */
export function textoDeMapa(r) {
    const filas = [];
    for (let i = 0; i < r.dias.length; i += POR_FILA) filas.push(r.dias.slice(i, i + POR_FILA).map((d) => _EMOJI[d.estado] || '⚪').join(''));
    const lineas = [
        t('🗺️ Mi camino en {app} · Día {n}', { app: BRAND, n: formatNumber(r.nivel) }),
        '',
        ...filas,
        '',
        tn(r.estrellas, '⭐ {n} estrella', '⭐ {n} estrellas', { n: formatNumber(r.estrellas) }),
    ];
    if (r.racha >= 2) lineas.push(tn(r.racha, '🔥 Racha de {n} día', '🔥 Racha de {n} días', { n: r.racha }));
    lineas.push(t('🏅 Mundo {nombre}', { nombre: r.mundo.nombre }), '', t('¿Y tú, cómo va tu camino? 💪'), SITIO);
    return lineas.join('\n');
}

// ── El dibujo ────────────────────────────────────────────────────────────────────────────────────────────────────
const _filas = (r) => Math.max(1, Math.ceil(r.dias.length / POR_FILA));

const _palomita = (ctx, cx, cy, R) => {
    ctx.save();
    ctx.strokeStyle = BLANCO; ctx.lineWidth = Math.max(2, R * 0.2); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - R * 0.36, cy + R * 0.02); ctx.lineTo(cx - R * 0.1, cy + R * 0.28); ctx.lineTo(cx + R * 0.38, cy - R * 0.26);
    ctx.stroke(); ctx.restore();
};

/**
 * Los niveles como en el mapa: un camino que serpentea en filas de 7 (la de arriba es la más NUEVA, como se sube en
 * el mapa) y va y vuelve (tablero). Devuelve el alto usado.
 */
const _camino = (ctx, r, x0, x1, yTop, R, grosor) => {
    const filas = _filas(r);
    const paso = (x1 - x0) / POR_FILA;
    const altoFila = R * 2 + R * 1.3;
    // la fila más nueva arriba; dentro de la fila, alterna el sentido para que el camino no salte
    const punto = (i) => {
        const deAbajo = Math.floor(i / POR_FILA);
        const fila = filas - 1 - deAbajo;
        const enFila = i % POR_FILA;
        const col = deAbajo % 2 === 0 ? enFila : POR_FILA - 1 - enFila;
        return { cx: x0 + paso * (col + 0.5), cy: yTop + R + altoFila * fila };
    };
    const pts = r.dias.map((_, i) => punto(i));
    if (pts.length > 1) {
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'; ctx.lineWidth = grosor * 1.6;
        ctx.beginPath(); ctx.moveTo(pts[0].cx, pts[0].cy);
        for (let i = 1; i < pts.length; i += 1) {
            const a = pts[i - 1]; const b = pts[i];
            if (a.cy === b.cy) ctx.lineTo(b.cx, b.cy);
            else {
                const lado = a.cx > x0 + (x1 - x0) / 2 ? 1 : -1;      // la vuelta, por fuera
                ctx.bezierCurveTo(a.cx + lado * paso * 0.9, a.cy, b.cx + lado * paso * 0.9, b.cy, b.cx, b.cy);
            }
        }
        ctx.stroke();
        ctx.restore();
    }
    r.dias.forEach((d, i) => {
        const { cx, cy } = pts[i];
        const radio = d.esHoy ? R * 1.18 : R;
        if (d.estado === 'vacio') {
            ctx.save();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
            ctx.beginPath(); ctx.arc(cx, cy, radio, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = grosor * 0.6; ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.setLineDash?.([grosor * 0.5, grosor * 0.9]);
            ctx.beginPath(); ctx.arc(cx, cy, radio, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        } else {
            const [c1, c2] = TONO[d.estado] || TONO.meta;
            ctx.save();
            const g = ctx.createRadialGradient?.(cx - radio * 0.3, cy - radio * 0.35, radio * 0.1, cx, cy, radio);
            if (g) { g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; } else ctx.fillStyle = c2;
            ctx.beginPath(); ctx.arc(cx, cy, radio, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            if (d.estado === 'meta') _palomita(ctx, cx, cy, radio);
        }
        if (d.esHoy) {
            ctx.save(); ctx.strokeStyle = BLANCO; ctx.lineWidth = Math.max(3, grosor * 0.5);
            ctx.beginPath(); ctx.arc(cx, cy, radio + grosor * 0.9, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
    });
    return altoFila * (filas - 1) + R * 2;
};

/** «Día 67»: la cifra grande con «Día» delante, más pequeño. Devuelve el ancho. */
const _dia = (ctx, r, x, y, tam, alinear = 'left') => {
    const rot = t('Día');
    const num = formatNumber(r.nivel);
    ctx.save();
    ctx.font = `700 ${Math.round(tam * 0.36)}px ${PINCEL.FUENTE}`; const a = ctx.measureText(rot).width;
    ctx.font = `800 ${tam}px ${PINCEL.FUENTE}`; const b = ctx.measureText(num).width;
    ctx.restore();
    const x0 = alinear === 'center' ? x - (a + 14 + b) / 2 : x;
    PINCEL.texto(ctx, rot, x0, y, { tam: Math.round(tam * 0.36), peso: 700, color: CLARO });
    PINCEL.texto(ctx, num, x0 + a + 14, y, { tam, peso: 800 });
    return a + 14 + b;
};

const _cifras = (r) => {
    const out = [{ rotulo: t('Estrellas'), valor: `★ ${formatNumber(r.estrellas)}` }];
    out.push({ rotulo: t('Racha'), valor: tn(r.racha, '{n} día', '{n} días', { n: r.racha }) });
    out.push({ rotulo: t('Mundo'), valor: r.mundo.nombre });
    return out;
};

// ── «titular» ── el día grande, el camino y las cifras abajo
const _yTitularCamino = (r) => BASE - 270 - (_filas(r) - 1) * 104 - 60;
const _titular = (ctx, r, ac = ORO) => {
    const col = (ANCHO - 2 * M) / 3;
    _cifras(r).forEach((c, i) => {
        const x = M + i * col;
        PINCEL.texto(ctx, c.valor, x, BASE - 140, { tam: 50, peso: 800, max: col - 16, color: i === 0 ? ac[0] : BLANCO });
        PINCEL.rotulo(ctx, c.rotulo, x, BASE - 95, { tam: 22, max: col - 24 });
    });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'; ctx.fillRect(M, BASE - 220, ANCHO - 2 * M, 2);
    const yC = _yTitularCamino(r);
    _camino(ctx, r, M - 10, ANCHO - M + 10, yC, 30, 10);
    const yN = yC - 60;
    _dia(ctx, r, M - 6, yN, 200);
    PINCEL.rotulo(ctx, t('Mi camino'), M, yN - 200, { tam: 32, color: ac[0], aire: 0.3 });
};

// ── «minimal» ── centrado, tipo sticker
const _yMinimalCamino = (r) => BASE - 150 - (_filas(r) - 1) * 99 - 60;
const _minimal = (ctx, r, ac = ORO) => {
    const cx = ANCHO / 2;
    const yC = _yMinimalCamino(r);
    _camino(ctx, r, M + 20, ANCHO - M - 20, yC, 30, 10);
    PINCEL.texto(ctx, _cifras(r).map((c) => c.valor).join('   ·   '), cx, yC - 44,
        { tam: 32, peso: 700, color: CLARO, alinear: 'center', max: ANCHO - 2 * M });
    _dia(ctx, r, cx, yC - 110, 170, 'center');
    PINCEL.rotulo(ctx, t('Mi camino'), cx, yC - 310, { tam: 28, alinear: 'center', aire: 0.3, ...(ac === ORO ? {} : { color: ac[0] }) });
};

// ── «cristal» ── la tarjeta esmerilada (su fondo lo pinta historiaConFoto con la misma geometría)
const _cristal = (ctx, r) => {
    const { alto, x, w, y } = CRISTAL;
    ctx.save(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'; ctx.lineWidth = 2; PINCEL.rect(ctx, x + 1, y + 1, w - 2, alto - 2, 55); ctx.stroke(); ctx.restore();
    const xi = x + 52, xd = x + w - 52;
    PINCEL.rotulo(ctx, t('Mi camino'), xi, y + 76, { tam: 26, aire: 0.24, sombra: false, max: 360 });
    PINCEL.texto(ctx, t('Mundo {nombre}', { nombre: r.mundo.nombre }), xd, y + 76, { tam: 26, peso: 700, color: ORO[0], alinear: 'right', sombra: false, max: 360 });
    _dia(ctx, r, xi, y + 176, 84);
    const R = _filas(r) > 1 ? 22 : 26;
    _camino(ctx, r, x + 40, x + w - 40, y + 222, R, 7);
    PINCEL.texto(ctx, _cifras(r).slice(0, 2).map((c) => `${c.rotulo} ${c.valor}`).join('  ·  '), x + w / 2, y + alto - 30,
        { tam: 26, peso: 700, color: CLARO, alinear: 'center', sombra: false, max: w - 100 });
};

const _PINTAR = { titular: _titular, minimal: _minimal, cristal: _cristal };

/** La caja de cada composición en su sitio de siempre (lo que se arrastra y escala), en px del lienzo. */
function _caja(r, estilo) {
    if (estilo === 'minimal') {
        const y0 = _yMinimalCamino(r) - 310 - 40;
        return { x: M, y: y0, w: ANCHO - 2 * M, h: BASE - 120 - y0 };
    }
    if (estilo === 'cristal') return { x: CRISTAL.x, y: CRISTAL.y, w: CRISTAL.w, h: CRISTAL.alto };
    const y0 = _yTitularCamino(r) - 60 - 200 - 44;
    return { x: M - 12, y: y0, w: ANCHO - 2 * M + 16, h: BASE - 85 - y0 };
}

export const PINTOR_MAPA = Object.freeze({
    pintar: (ctx, r, estilo, acento) => (_PINTAR[estilo] || _titular)(ctx, r, acento || ORO),
    caja: _caja,
});
