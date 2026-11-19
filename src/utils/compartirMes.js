// [P1-PLAN-LOTE-1100 · 2026-11-18] «Compartir mi mes» — lo que le recomendé al dueño cuando preguntó por compartir «el
// mes o incluso los últimos 6 meses» (y dijo «procede»): la semana primero (1082) y el mes como RESUMEN DE LOGROS.
// La MISMA historia que el día y la semana (tu foto de fondo, los siete diseños, el sticker que se mueve) con lo del
// mes: un anillo por día en su cuadrícula de calendario, los días en meta, los días con registro y la mejor racha.
// Sin kcal ni macros (como la semana: «te pasaste 9 días» no se comparte). Todo en el teléfono.
import { t, tn, formatNumber } from '../i18n';
import { BRAND } from '../data/routeMeta';
import { SITIO } from './compartirDia';
import { PINCEL } from './historiaConFoto';

const ESTADOS = new Set(['meta', 'bajo', 'pasado', 'vacio', 'futuro']);
const { COLOR, M, BASE, BLANCO, CLARO, CRISTAL } = PINCEL;
const ANCHO = 1080;
// Tinta fija (JPEG): la de los anillos de «Tu semana». Rojo en rgb(): el trinquete de hex es de la interfaz.
const TONO = { meta: COLOR.carbs, bajo: COLOR.calories, pasado: ['rgb(251, 113, 133)', 'rgb(239, 68, 68)'] };
const ORO = COLOR.calories;

/** La racha más larga de días en meta seguidos dentro del mes. */
export const mejorRachaDelMes = (dias) => {
    let mejor = 0;
    let actual = 0;
    (dias || []).forEach((d) => {
        if (d.estado === 'meta') { actual += 1; mejor = Math.max(mejor, actual); } else if (d.estado !== 'futuro') actual = 0;
    });
    return mejor;
};

/** `mes` = { nombre: 'Noviembre 2026', inicio: 0-6 (día de la semana del día 1), dias: [{ iso, estado }], enCurso }. */
export function resumenDeMes(mes) {
    const m = mes || {};
    const dias = (Array.isArray(m.dias) ? m.dias : []).slice(0, 31).map((d) => ({
        iso: String(d?.iso || ''),
        estado: ESTADOS.has(d?.estado) ? d.estado : 'vacio',
    }));
    const pasados = dias.filter((d) => d.estado !== 'futuro');
    const enMeta = pasados.filter((d) => d.estado === 'meta').length;
    const registrados = pasados.filter((d) => d.estado !== 'vacio').length;
    return {
        tipo: 'mes',
        nombre: String(m.nombre || ''),
        periodo: String(m.nombre || ''),
        enCurso: !!m.enCurso,
        inicio: Math.max(0, Math.min(6, Number(m.inicio) || 0)),
        pregunta: t('¿Y tú, cómo va tu mes?'),
        dias,
        transcurridos: pasados.length,
        enMeta,
        registrados,
        mejorRacha: mejorRachaDelMes(dias),
        perfecta: pasados.length >= 28 && enMeta === pasados.length,
        pintor: PINTOR_MES,
    };
}

const _EMOJI = { meta: '✅', bajo: '🟡', pasado: '🟠', vacio: '⚪', futuro: '▫️' };

/** El mensaje para WhatsApp (la reserva sin imagen). */
export function textoDeMes(r) {
    const filas = [];
    const celdas = [...Array(r.inicio).fill('  '), ...r.dias.map((d) => _EMOJI[d.estado] || '⚪')];
    for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7).join(''));
    const lineas = [
        t('📅 Mi mes en {app} · {mes}', { app: BRAND, mes: r.nombre }),
        '',
        ...filas,
        '',
        tn(r.enMeta, '✅ {n} día en meta', '✅ {n} días en meta', { n: r.enMeta }),
        tn(r.registrados, '📝 {n} día con registro', '📝 {n} días con registro', { n: r.registrados }),
    ];
    if (r.mejorRacha >= 2) lineas.push(tn(r.mejorRacha, '🔥 Mejor racha: {n} día', '🔥 Mejor racha: {n} días', { n: r.mejorRacha }));
    lineas.push('', t('¿Y tú, cómo va tu mes? 💪'), SITIO);
    return lineas.join('\n');
}

// ── El dibujo ────────────────────────────────────────────────────────────────────────────────────────────────────
const _filas = (r) => Math.ceil((r.inicio + r.dias.length) / 7);

const _palomita = (ctx, cx, cy, R) => {
    ctx.save();
    ctx.strokeStyle = BLANCO; ctx.lineWidth = Math.max(2, R * 0.2); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - R * 0.36, cy + R * 0.02); ctx.lineTo(cx - R * 0.1, cy + R * 0.28); ctx.lineTo(cx + R * 0.38, cy - R * 0.26);
    ctx.stroke(); ctx.restore();
};

/** La cuadrícula del mes (7 columnas, domingo primero) entre `x0` y `x1` desde `yTop`. Devuelve su alto. */
const _rejilla = (ctx, r, x0, x1, yTop, R, grosor) => {
    const paso = (x1 - x0) / 7;
    const alto = R * 2 + Math.max(10, R * 0.55);
    r.dias.forEach((d, i) => {
        const pos = r.inicio + i;
        const cx = x0 + paso * ((pos % 7) + 0.5);
        const cy = yTop + alto * Math.floor(pos / 7) + R;
        if (d.estado === 'vacio' || d.estado === 'futuro') {
            ctx.save();
            ctx.lineWidth = grosor * 0.6;
            ctx.strokeStyle = d.estado === 'futuro' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.4)';
            if (d.estado === 'vacio') ctx.setLineDash?.([grosor * 0.5, grosor * 0.9]);
            ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        } else {
            PINCEL.anillo(ctx, cx, cy, R, grosor, 100, TONO[d.estado]);
            if (d.estado === 'meta') _palomita(ctx, cx, cy, R);
        }
    });
    return alto * _filas(r);
};

/** «18/30»: los días en meta sobre los transcurridos. Devuelve el ancho. */
const _fraccion = (ctx, r, x, y, tam, alinear = 'left') => {
    const total = `/${formatNumber(Math.max(1, r.transcurridos))}`;
    ctx.save();
    ctx.font = `800 ${tam}px ${PINCEL.FUENTE}`; const a = ctx.measureText(formatNumber(r.enMeta)).width;
    ctx.font = `700 ${Math.round(tam * 0.42)}px ${PINCEL.FUENTE}`; const b = ctx.measureText(total).width;
    ctx.restore();
    const x0 = alinear === 'center' ? x - (a + 8 + b) / 2 : x;
    PINCEL.texto(ctx, formatNumber(r.enMeta), x0, y, { tam, peso: 800 });
    PINCEL.texto(ctx, total, x0 + a + 8, y, { tam: Math.round(tam * 0.42), peso: 700, color: CLARO });
    return a + 8 + b;
};

const _diasEnMeta = (r) => tn(r.enMeta, 'día en meta', 'días en meta', { n: r.enMeta });
const _cifras = (r) => {
    const out = [{ rotulo: t('Con registro'), valor: tn(r.registrados, '{n} día', '{n} días', { n: r.registrados }) }];
    if (r.mejorRacha >= 2) out.push({ rotulo: t('Mejor racha'), valor: tn(r.mejorRacha, '{n} día', '{n} días', { n: r.mejorRacha }) });
    return out;
};
const _perfecto = () => t('Mes perfecto');

// ── «titular» ── la cifra de portada, la cuadrícula y las cifras abajo
const _yTitularRejilla = (r) => BASE - 250 - _filas(r) * 64;
const _titular = (ctx, r, ac = ORO) => {
    const col = (ANCHO - 2 * M) / 3;
    _cifras(r).forEach((c, i) => {
        const x = M + i * col * 1.5;
        PINCEL.texto(ctx, c.valor, x, BASE - 140, { tam: 54, peso: 800, max: col * 1.5 - 16 });
        PINCEL.rotulo(ctx, c.rotulo, x, BASE - 95, { tam: 22, max: col * 1.5 - 24 });
    });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'; ctx.fillRect(M, BASE - 220, ANCHO - 2 * M, 2);
    const yR = _yTitularRejilla(r);
    _rejilla(ctx, r, M - 10, ANCHO - M + 10, yR, 24, 9);
    const yN = yR - 50;
    const ancho = _fraccion(ctx, r, M - 6, yN, 200);
    PINCEL.texto(ctx, _diasEnMeta(r), M + ancho + 22, yN, { tam: 44, peso: 700, color: TONO.meta[0], max: ANCHO - 2 * M - ancho - 22 });
    PINCEL.rotulo(ctx, r.nombre, M, yN - 190, { tam: 32, color: ac[0], aire: 0.3, max: ANCHO - 2 * M - 300 });
    if (r.perfecta) PINCEL.insignia(ctx, ANCHO - M, yN - 201, 'right', _perfecto());
};

// ── «minimal» ── centrado, tipo sticker
const _yMinimalRejilla = (r) => BASE - 160 - _filas(r) * 60;
const _minimal = (ctx, r, ac = ORO) => {
    const cx = ANCHO / 2;
    const yR = _yMinimalRejilla(r);
    _rejilla(ctx, r, M + 40, ANCHO - M - 40, yR, 22, 8);
    PINCEL.texto(ctx, _cifras(r).map((c) => `${c.valor} · ${c.rotulo.toLowerCase()}`).join('   '), cx, yR - 40,
        { tam: 30, peso: 600, color: CLARO, alinear: 'center', max: ANCHO - 2 * M });
    PINCEL.texto(ctx, _diasEnMeta(r), cx, yR - 100, { tam: 34, peso: 600, color: CLARO, alinear: 'center' });
    _fraccion(ctx, r, cx, yR - 160, 180, 'center');
    PINCEL.rotulo(ctx, r.nombre, cx, yR - 350, { tam: 28, alinear: 'center', aire: 0.3, ...(ac === ORO ? {} : { color: ac[0] }) });
    if (r.perfecta) PINCEL.insignia(ctx, cx, yR - 420, 'center', _perfecto());
};

// ── «cristal» ── la tarjeta esmerilada (su fondo lo pinta historiaConFoto con la misma geometría)
const _cristal = (ctx, r) => {
    const { alto, x, w, y } = CRISTAL;
    ctx.save(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'; ctx.lineWidth = 2; PINCEL.rect(ctx, x + 1, y + 1, w - 2, alto - 2, 55); ctx.stroke(); ctx.restore();
    const xi = x + 52, xd = x + w - 52;
    PINCEL.rotulo(ctx, r.nombre, xi, y + 76, { tam: 26, aire: 0.24, sombra: false, max: 420 });
    const ancho = _fraccion(ctx, r, xd - 260, y + 92, 72);
    PINCEL.texto(ctx, _diasEnMeta(r), xd - 260 + ancho + 12, y + 92, { tam: 24, peso: 700, color: TONO.meta[0], max: 260 - ancho - 12, sombra: false });
    const R = _filas(r) > 5 ? 16 : 19;
    _rejilla(ctx, r, x + 40, x + w - 40, y + 128, R, 6);
    PINCEL.texto(ctx, _cifras(r).map((c) => `${c.rotulo} ${c.valor}`).join('  ·  '), x + w / 2, y + alto - 30,
        { tam: 26, peso: 700, color: CLARO, alinear: 'center', sombra: false, max: w - 100 });
    if (r.perfecta) PINCEL.insignia(ctx, ANCHO / 2, y - 52, 'center', _perfecto());
};

const _PINTAR = { titular: _titular, minimal: _minimal, cristal: _cristal };

/** La caja de cada composición en su sitio de siempre (lo que se arrastra y escala), en px del lienzo. */
function _caja(r, estilo) {
    if (estilo === 'minimal') {
        const y0 = _yMinimalRejilla(r) - (r.perfecta ? 420 : 350) - 40;
        return { x: M, y: y0, w: ANCHO - 2 * M, h: BASE - 120 - y0 };
    }
    if (estilo === 'cristal') {
        const y0 = r.perfecta ? CRISTAL.y - 52 - 30 : CRISTAL.y;
        return { x: CRISTAL.x, y: y0, w: CRISTAL.w, h: CRISTAL.y + CRISTAL.alto - y0 };
    }
    const y0 = _yTitularRejilla(r) - 50 - 190 - 44;
    return { x: M - 12, y: y0, w: ANCHO - 2 * M + 16, h: BASE - 85 - y0 };
}

export const PINTOR_MES = Object.freeze({
    pintar: (ctx, r, estilo, acento) => (_PINTAR[estilo] || _titular)(ctx, r, acento || ORO),
    caja: _caja,
});
