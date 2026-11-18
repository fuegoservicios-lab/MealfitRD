// [P1-PLAN-LOTE-1082 · 2026-11-18] «Compartir mi semana» (decisión del dueño tras hablarlo: la semana es la unidad del
// juego y lo que la gente comparte; el informe sigue siendo para el médico). La MISMA historia que el día —tu foto de
// fondo, los tres estilos, las cifras como sticker— con lo de la semana: los 7 anillos, los días en meta, las
// estrellas, la racha y el rango. Sin kcal ni macros: en una semana, «te pasaste 4 días» desmotiva al compartir.
// Todo ocurre en el teléfono, como el día.
import { t, tn, formatNumber, formatDate } from '../i18n';
import { BRAND } from '../data/routeMeta';
import { SITIO } from './compartirDia';
import { PINCEL } from './historiaConFoto';

export const DIAS = 7;
export const ESTRELLAS_MAX = 3;
const ESTADOS = new Set(['meta', 'bajo', 'pasado', 'vacio', 'futuro']);
const NOMBRE_RANGO = () => ({ bronce: t('Bronce'), plata: t('Plata'), oro: t('Oro'), platino: t('Platino'), diamante: t('Diamante') });
// Tinta FIJA de los anillos (es un JPEG con su propio fondo, no interfaz): la MISMA paleta de la historia del día
// en meta el verde, corto el ámbar, las estrellas el oro de las calorías; «pasado», el rojo de la tira de la app
// (`.dia_pasado .arco`, el mismo degradado que su barra).
const { COLOR } = PINCEL;
const TONO = { meta: COLOR.carbs, bajo: COLOR.calories, pasado: ['#FB7185', '#EF4444'] };
const ORO = COLOR.calories;

/** Los números que se comparten, ya decididos. `semana` = lo que la tarjeta «Tu semana» ya tiene pintado. */
export function resumenDeSemana(semana) {
    const s = semana || {};
    const letra = (iso) => {
        try { return iso ? formatDate(new Date(`${iso}T12:00:00`), { weekday: 'narrow' }) : ''; } catch { return ''; }
    };
    const dias = (Array.isArray(s.dias) ? s.dias : []).slice(0, DIAS).map((d) => ({
        iso: String(d?.iso || ''),
        letra: d?.letra || letra(d?.iso),
        estado: ESTADOS.has(d?.estado) ? d.estado : 'vacio',
        ratio: Math.max(0, Math.min(1, Number(d?.ratio) || 0)),
    }));
    const enMeta = Math.max(0, Math.min(DIAS, Number.isFinite(Number(s.enMeta)) ? Number(s.enMeta) : dias.filter((d) => d.estado === 'meta').length));
    const estrellas = Math.max(0, Math.min(ESTRELLAS_MAX, Number(s.estrellas) || 0));
    const rangoClave = s.rango && NOMBRE_RANGO()[s.rango] ? s.rango : null;
    return {
        tipo: 'semana',
        numero: Math.max(1, Number(s.numero) || 1),
        enCurso: !!s.enCurso,
        periodo: String(s.periodo || ''),
        pregunta: t('¿Y tú, cómo va tu semana?'),
        dias,
        enMeta,
        estrellas,
        racha: Math.max(0, Number(s.racha) || 0),
        rango: rangoClave ? { clave: rangoClave, nombre: NOMBRE_RANGO()[rangoClave] } : null,
        perfecta: enMeta >= DIAS,
        pintor: PINTOR_SEMANA,
    };
}

const _EMOJI_DIA = { meta: '✅', bajo: '🟡', pasado: '🟠', vacio: '⚪', futuro: '▫️' };

/** El mensaje para WhatsApp (la reserva cuando no se puede compartir la imagen). */
export function textoDeSemana(r) {
    const lineas = [
        t('🏆 Mi semana en {app} · Semana {n}', { app: BRAND, n: r.numero }) + (r.periodo ? ` (${r.periodo})` : ''),
        '',
        r.dias.map((d) => _EMOJI_DIA[d.estado] || '⚪').join(''),
        t('✅ {n} de {total} días en meta', { n: r.enMeta, total: DIAS }),
        t('⭐ {n} de {total} estrellas', { n: r.estrellas, total: ESTRELLAS_MAX }),
    ];
    if (r.racha >= 2) lineas.push(tn(r.racha, '🔥 Racha de {n} día', '🔥 Racha de {n} días', { n: r.racha }));
    if (r.rango) lineas.push(t('🏅 Rango {rango}', { rango: r.rango.nombre }));
    lineas.push('', t('¿Y tú, cómo va tu semana? 💪'), SITIO);
    return lineas.join('\n');
}

// ── El dibujo ────────────────────────────────────────────────────────────────────────────────────────────────────
const { M, BASE, BLANCO, CLARO, TENUE, CRISTAL } = PINCEL;
const ANCHO = 1080;

const _estrella = (ctx, cx, cy, R, llena) => {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? R * 0.45 : R;
        ctx[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
    ctx.closePath();
    if (llena) {
        const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        g.addColorStop(0, ORO[0]); g.addColorStop(1, ORO[1]);
        ctx.fillStyle = g; ctx.shadowColor = 'rgba(245, 158, 11, 0.7)'; ctx.shadowBlur = R * 0.8;
        ctx.fill();
    } else {
        ctx.lineWidth = Math.max(2, R * 0.12); ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.stroke();
    }
    ctx.restore();
};

/** Las 3 estrellas en fila; `x` según `alinear`, `cy` su centro. Devuelve el ancho. */
const _estrellas = (ctx, r, x, cy, R, alinear = 'left') => {
    const paso = R * 2.4;
    const ancho = paso * (ESTRELLAS_MAX - 1) + 2 * R;
    const x0 = alinear === 'center' ? x - ancho / 2 : alinear === 'right' ? x - ancho : x;
    for (let i = 0; i < ESTRELLAS_MAX; i++) _estrella(ctx, x0 + R + i * paso, cy, R, i < r.estrellas);
    return ancho;
};

const _palomita = (ctx, cx, cy, R) => {
    ctx.save();
    ctx.strokeStyle = BLANCO; ctx.lineWidth = R * 0.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.36, cy + R * 0.02);
    ctx.lineTo(cx - R * 0.1, cy + R * 0.28);
    ctx.lineTo(cx + R * 0.38, cy - R * 0.26);
    ctx.stroke();
    ctx.restore();
};

/** La tira de 7 anillos entre `x0` y `x1`, con la letra del día debajo (como la tarjeta de la app). */
const _tira = (ctx, r, x0, x1, cy, R, grosor, tamLetra) => {
    const paso = (x1 - x0) / DIAS;
    r.dias.forEach((d, i) => {
        const cx = x0 + paso * (i + 0.5);
        if (d.estado === 'vacio' || d.estado === 'futuro') {
            ctx.save();
            ctx.lineWidth = grosor * 0.6;
            ctx.strokeStyle = d.estado === 'futuro' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.42)';
            if (d.estado === 'vacio') ctx.setLineDash?.([grosor * 0.5, grosor * 0.9]);
            ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        } else {
            PINCEL.anillo(ctx, cx, cy, R, grosor, d.estado === 'bajo' ? Math.max(8, d.ratio * 100) : 100, TONO[d.estado]);
            if (d.estado === 'meta') _palomita(ctx, cx, cy, R);
        }
        PINCEL.texto(ctx, d.letra.toUpperCase(), cx, cy + R + tamLetra + 14, {
            tam: tamLetra, peso: 700, color: d.estado === 'futuro' ? TENUE : CLARO, alinear: 'center',
        });
    });
};

/** «5/7»: la cifra grande y «/7» más pequeño, desde `x` (o centrado). Devuelve el ancho. */
const _fraccion = (ctx, r, x, y, tam, alinear = 'left') => {
    const total = `/${DIAS}`;
    ctx.save();
    ctx.font = `800 ${tam}px ${PINCEL.FUENTE}`; const a = ctx.measureText(formatNumber(r.enMeta)).width;
    ctx.font = `700 ${Math.round(tam * 0.46)}px ${PINCEL.FUENTE}`; const b = ctx.measureText(total).width;
    ctx.restore();
    const x0 = alinear === 'center' ? x - (a + 8 + b) / 2 : x;
    PINCEL.texto(ctx, formatNumber(r.enMeta), x0, y, { tam, peso: 800 });
    PINCEL.texto(ctx, total, x0 + a + 8, y, { tam: Math.round(tam * 0.46), peso: 700, color: CLARO });
    return a + 8 + b;
};

const _titulo = (r) => t('Semana {n}', { n: r.numero });
const _diasEnMeta = (r) => tn(r.enMeta, 'día en meta', 'días en meta', { n: r.enMeta });
const _perfecta = () => t('Semana perfecta');

// ── «titular»: la cifra de portada ──
const _yTitular = BASE - 520;
const _titular = (ctx, r, ac = ORO) => {
    const cols = [{ rotulo: t('Estrellas'), valor: `${r.estrellas}/${ESTRELLAS_MAX}` }];
    if (r.racha >= 2) cols.push({ rotulo: t('Racha'), valor: tn(r.racha, '{n} día', '{n} días', { n: r.racha }) });
    if (r.rango) cols.push({ rotulo: t('Rango'), valor: r.rango.nombre });
    const col = (ANCHO - 2 * M) / 3;
    cols.forEach((c, i) => {
        const x = M + i * col;
        PINCEL.texto(ctx, c.valor, x, BASE - 150, { tam: 56, peso: 800, max: col - 16 });
        PINCEL.rotulo(ctx, c.rotulo, x, BASE - 103, { tam: 22, max: col - 24 });
    });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'; ctx.fillRect(M, BASE - 230, ANCHO - 2 * M, 2);
    _tira(ctx, r, M - 10, ANCHO - M + 10, BASE - 360, 44, 14, 26);

    const ancho = _fraccion(ctx, r, M - 6, _yTitular, 250);
    PINCEL.texto(ctx, _diasEnMeta(r), M + ancho + 24, _yTitular, { tam: 50, peso: 700, color: TONO.meta[0], max: ANCHO - 2 * M - ancho - 24 });
    PINCEL.rotulo(ctx, _titulo(r), M, _yTitular - 230, { tam: 32, color: ac[0], aire: 0.3 });   // [1095] el acento del diseño
    if (r.perfecta) PINCEL.insignia(ctx, ANCHO - M, _yTitular - 241, 'right', _perfecta());
    else _estrellas(ctx, r, ANCHO - M, _yTitular - 241, 22, 'right');
};

// ── «minimal»: centrado, tipo sticker ──
const _minimal = (ctx, r, ac = ORO) => {
    const cx = ANCHO / 2;
    if (r.perfecta) PINCEL.insignia(ctx, cx, BASE - 760, 'center', _perfecta());
    PINCEL.rotulo(ctx, _titulo(r), cx, BASE - 680, { tam: 28, alinear: 'center', aire: 0.3, ...(ac === ORO ? {} : { color: ac[0] }) });
    _fraccion(ctx, r, cx, BASE - 480, 200, 'center');
    PINCEL.texto(ctx, _diasEnMeta(r), cx, BASE - 410, { tam: 34, peso: 600, color: CLARO, alinear: 'center' });
    _estrellas(ctx, r, cx, BASE - 330, 26, 'center');
    _tira(ctx, r, M + 20, ANCHO - M - 20, BASE - 200, 38, 12, 24);
};

// ── «cristal»: la tarjeta esmerilada (su fondo lo pinta historiaConFoto con la misma geometría) ──
const _cristal = (ctx, r) => {
    const { alto, x, w, y } = CRISTAL;
    ctx.save(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'; ctx.lineWidth = 2; PINCEL.rect(ctx, x + 1, y + 1, w - 2, alto - 2, 55); ctx.stroke(); ctx.restore();
    const xi = x + 56, xd = x + w - 56;
    PINCEL.rotulo(ctx, _titulo(r), xi, y + 92, { tam: 28, aire: 0.24, sombra: false });
    _estrellas(ctx, r, xd, y + 82, 22, 'right');
    const ancho = _fraccion(ctx, r, xi, y + 214, 110);
    PINCEL.texto(ctx, _diasEnMeta(r), xi + ancho + 20, y + 214, { tam: 36, peso: 700, color: TONO.meta[0], max: xd - xi - ancho - 20, sombra: false });
    _tira(ctx, r, x + 36, x + w - 36, y + 318, 36, 11, 22);
    const pie = [];
    if (r.racha >= 2) pie.push(tn(r.racha, 'Racha de {n} día', 'Racha de {n} días', { n: r.racha }));
    if (r.rango) pie.push(t('Rango {rango}', { rango: r.rango.nombre }));
    if (pie.length) PINCEL.texto(ctx, pie.join('  ·  '), x + w / 2, y + alto - 34, { tam: 28, peso: 700, color: CLARO, alinear: 'center', sombra: false, max: w - 112 });
    if (r.perfecta) PINCEL.insignia(ctx, ANCHO / 2, y - 52, 'center', _perfecta());
};

const _PINTAR = { titular: _titular, minimal: _minimal, cristal: _cristal };

/** La caja de cada estilo en su sitio de siempre (lo que se arrastra y escala), en px del lienzo. */
function _caja(r, estilo) {
    if (estilo === 'minimal') {
        const y0 = (r.perfecta ? BASE - 760 : BASE - 680) - 40;
        return { x: M, y: y0, w: ANCHO - 2 * M, h: BASE - 110 - y0 };
    }
    if (estilo === 'cristal') {
        const y0 = r.perfecta ? CRISTAL.y - 52 - 30 : CRISTAL.y;
        return { x: CRISTAL.x, y: y0, w: CRISTAL.w, h: CRISTAL.y + CRISTAL.alto - y0 };
    }
    const y0 = _yTitular - 230 - 44;
    return { x: M - 12, y: y0, w: ANCHO - 2 * M + 16, h: BASE - 92 - y0 };
}

export const PINTOR_SEMANA = Object.freeze({
    pintar: (ctx, r, estilo, acento) => (_PINTAR[estilo] || _titular)(ctx, r, acento || ORO),
    caja: _caja,
});
