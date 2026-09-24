// [P1-COMPARTIR-DIA · 2026-09-23] La imagen que se comparte: 1080 px de ancho, estilo oscuro de la app, dibujada a
// mano en canvas (sin dependencias; la fuente Outfit ya está autoalojada). El alto se CALCULA antes de dibujar
// (secciones de alto fijo), así no hay que recortar ni dibujar dos veces. Sin canvas 2D (jsdom, WebView rara)
// devuelve null y la hoja comparte solo el texto.
import { t, formatNumber, formatPercent, tn } from '../i18n';
import { fechaLarga, SITIO } from './compartirDia';
import { formatoMicro } from '../components/dashboard/microsShared';
import { BRAND } from '../data/routeMeta';

const ANCHO = 1080;
const M = 72;                        // margen lateral
const FUENTE = '"Outfit", system-ui, -apple-system, "Segoe UI", sans-serif';
const ALTO = { cabecera: 250, calorias: 250, macro: 124, microsCab: 110, microFila: 112, comidasCab: 90, comida: 58, pie: 190, comidasBuffer: 50 };
const COLOR = {
    calories: ['#FCD34D', '#F59E0B'], protein: ['#93C5FD', '#3B82F6'], carbs: ['#6EE7B7', '#10B981'], fats: ['#F9A8D4', '#EC4899'],
};
// La etiqueta «máx.» de los techos (la de MicrosList en la app): píldora en mayúsculas junto al nombre del micro.
const ETIQUETA = { tam: 20, padX: 9, alto: 30, radio: 6, aire: 10 };

export function altoDeLaTarjeta(r) {
    let h = ALTO.cabecera + ALTO.calorias + 3 * ALTO.macro + ALTO.pie;
    if (r.micros.length) h += ALTO.microsCab + Math.ceil(r.micros.length / 2) * ALTO.microFila;
    if (r.comidas.length) h += ALTO.comidasCab + Math.min(r.comidas.length, 6) * ALTO.comida + ALTO.comidasBuffer;
    return Math.max(1080, h);
}

const _rect = (ctx, x, y, w, h, r) => {
    const rr = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
};

const _barra = (ctx, x, y, w, h, pct, [c1, c2]) => {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
    _rect(ctx, x, y, w, h, h / 2); ctx.fill();
    const lleno = Math.max(0, Math.min(1, (Number(pct) || 0) / 100)) * w;
    if (lleno <= 0) return;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    _rect(ctx, x, y, Math.max(lleno, h), h, h / 2); ctx.fill();
};

/** Pinta `s` (recortado con «…» si pasa de `max`) y devuelve el ancho que ocupó: quien pinta al lado lo necesita. */
const _texto = (ctx, s, x, y, { tam = 32, peso = 600, color = '#E2E8F0', alinear = 'left', max = null } = {}) => {
    ctx.font = `${peso} ${tam}px ${FUENTE}`;
    ctx.fillStyle = color;
    ctx.textAlign = alinear;
    ctx.textBaseline = 'alphabetic';
    let out = String(s);
    if (max && ctx.measureText(out).width > max) {
        while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
        out = `${out.trimEnd()}…`;
    }
    ctx.fillText(out, x, y);
    return ctx.measureText(out).width;
};

/** Ancho de la etiqueta «máx.» (deja puesta su fuente). */
const _anchoEtiqueta = (ctx, s) => {
    ctx.font = `800 ${ETIQUETA.tam}px ${FUENTE}`;
    return ctx.measureText(String(s).toUpperCase()).width + 2 * ETIQUETA.padX;
};

/** La etiqueta «máx.»: texto #94A3B8 sobre gris translúcido, radio 6, centrada en `yCentro`. Devuelve su ancho. */
const _etiqueta = (ctx, s, x, yCentro) => {
    const w = _anchoEtiqueta(ctx, s);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
    _rect(ctx, x, yCentro - ETIQUETA.alto / 2, w, ETIQUETA.alto, ETIQUETA.radio); ctx.fill();
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s).toUpperCase(), x + ETIQUETA.padX, yCentro);
    ctx.textBaseline = 'alphabetic';
    return w;
};

const _aBlob = (canvas) => new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(null); }
    }, 4000);
    try {
        if (typeof canvas.toBlob === 'function') {
            canvas.toBlob((b) => {
                if (!resolved) { resolved = true; clearTimeout(timeout); resolve(b || null); }
            }, 'image/png');
            return;
        }
    } catch { /* cae al dataURL */ }
    try {
        const [cab, datos] = canvas.toDataURL('image/png').split(',');
        const bin = atob(datos);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        if (!resolved) { resolved = true; clearTimeout(timeout); resolve(new Blob([bytes], { type: cab.includes('png') ? 'image/png' : 'application/octet-stream' })); }
    } catch {
        if (!resolved) { resolved = true; clearTimeout(timeout); resolve(null); }
    }
});

export async function dibujarTarjetaDelDia(r) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const alto = altoDeLaTarjeta(r);
    canvas.width = ANCHO; canvas.height = alto;
    let ctx = null;
    try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return null;
    try {
        await Promise.race([
            Promise.all([
                document.fonts?.load?.(`800 64px ${FUENTE}`), document.fonts?.load?.(`700 32px ${FUENTE}`), document.fonts?.load?.(`600 32px ${FUENTE}`),
            ].filter(Boolean)),
            new Promise((r) => setTimeout(r, 1500)),
        ]);
    } catch { /* la fuente del sistema sirve */ }

    // Fondo
    const fondo = ctx.createLinearGradient(0, 0, 0, alto);
    fondo.addColorStop(0, '#0B1120'); fondo.addColorStop(1, '#111827');
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, ANCHO, alto);
    const brillo = ctx.createRadialGradient(ANCHO * 0.85, 0, 0, ANCHO * 0.85, 0, 700);
    brillo.addColorStop(0, 'rgba(99, 102, 241, 0.35)'); brillo.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = brillo; ctx.fillRect(0, 0, ANCHO, alto);

    // Cabecera
    let y = 110;
    _texto(ctx, BRAND.toUpperCase(), M, y, { tam: 30, peso: 800, color: '#A5B4FC' });
    _texto(ctx, fechaLarga(r.fecha), ANCHO - M, y, { tam: 30, peso: 600, color: '#94A3B8', alinear: 'right' });
    y += 90;
    _texto(ctx, t('Mi día'), M, y, { tam: 72, peso: 800, color: '#FFFFFF' });
    y += 50;
    _texto(ctx, tn(r.comidasRegistradas, '{n} comida registrada', '{n} comidas registradas', { n: r.comidasRegistradas }), M, y, { tam: 30, color: '#94A3B8' });

    // Calorías
    y += 110;
    const cal = r.calorias;
    _texto(ctx, cal.etiqueta, M, y, { tam: 34, peso: 700, color: '#FCD34D' });
    y += 100;
    _texto(ctx, formatNumber(cal.valor), M, y, { tam: 110, peso: 800, color: '#FFFFFF' });
    const anchoNum = ctx.measureText(formatNumber(cal.valor)).width;
    if (cal.meta > 0) {
        _texto(ctx, ` / ${formatNumber(cal.meta)} kcal`, M + anchoNum, y, { tam: 40, peso: 600, color: '#94A3B8' });
        _texto(ctx, formatPercent(cal.pct), ANCHO - M, y, { tam: 44, peso: 800, color: '#FCD34D', alinear: 'right' });
    }
    y += 40;
    _barra(ctx, M, y, ANCHO - 2 * M, 26, cal.pct, COLOR.calories);

    // Macros
    y += 40;
    r.macros.forEach((mc) => {
        y += 70;
        _texto(ctx, mc.etiqueta, M, y, { tam: 36, peso: 700, color: '#E2E8F0' });
        _texto(ctx, mc.meta > 0 ? `${formatNumber(mc.valor)} / ${formatNumber(mc.meta)} g` : `${formatNumber(mc.valor)} g`,
            ANCHO - M, y, { tam: 36, peso: 800, color: '#FFFFFF', alinear: 'right' });
        y += 26;
        _barra(ctx, M, y, ANCHO - 2 * M, 18, mc.pct, COLOR[mc.clave]);
        y += ALTO.macro - 96;
    });

    // Micros (solo si hay datos: nunca una barra contra un cero inventado)
    if (r.micros.length) {
        y += 80;
        _texto(ctx, t('Micros'), M, y, { tam: 38, peso: 800, color: '#C4B5FD' });
        if (r.cobertura.con_datos < r.cobertura.total) {
            _texto(ctx, t('(micros de {n} de {total} comidas)', { n: r.cobertura.con_datos, total: r.cobertura.total }),
                ANCHO - M, y, { tam: 26, color: '#94A3B8', alinear: 'right' });
        }
        y += ALTO.microsCab - 80;
        const col = (ANCHO - 2 * M - 48) / 2;
        r.micros.forEach((f, i) => {
            const x = M + (i % 2) * (col + 48);
            const yy = y + Math.floor(i / 2) * ALTO.microFila + 44;
            // El valor lleva el formato de todos también en los techos («2,310 / 2,000 mg»): «2,310 mg · máx. 2,0…» no
            // cabía. El techo lo dice la etiqueta «máx.» junto al nombre, como en la tarjeta de la app (MicrosList).
            // El valor va primero: el nombre y la etiqueta se quedan con el ancho que sobra.
            const valor = f.meta ? `${formatoMicro(f.valor, f.unit)} / ${formatoMicro(f.meta, f.unit)} ${f.unit}` : `${formatoMicro(f.valor, f.unit)} ${f.unit}`;
            const anchoValor = _texto(ctx, valor, x + col, yy, { tam: 28, peso: 800, color: '#FFFFFF', alinear: 'right', max: col * 0.62 });
            const maximo = f.techo ? t('máx.') : '';
            const anchoEtiqueta = maximo ? _anchoEtiqueta(ctx, maximo) + ETIQUETA.aire : 0;
            const anchoNombre = _texto(ctx, f.label, x, yy, {
                tam: 30, peso: 700, color: '#E2E8F0', max: Math.max(60, col - anchoValor - 16 - anchoEtiqueta),
            });
            if (maximo) _etiqueta(ctx, maximo, x + anchoNombre + ETIQUETA.aire, yy - 11);   // centro de las mayúsculas a 30 px
            const pct = f.meta ? (f.valor / f.meta) * 100 : 0;
            const colores = f.techo ? (pct > 100 ? ['#F87171', '#EF4444'] : ['#67E8F9', '#22D3EE']) : ['#6EE7B7', '#10B981'];
            _barra(ctx, x, yy + 22, col, 12, pct, colores);
        });
        y += Math.ceil(r.micros.length / 2) * ALTO.microFila;
    }

    // Comidas (solo si el usuario lo eligió)
    if (r.comidas.length) {
        y += 70;
        _texto(ctx, t('Lo que comí'), M, y, { tam: 36, peso: 800, color: '#E2E8F0' });
        y += ALTO.comidasCab - 70;
        r.comidas.slice(0, 6).forEach((x) => {
            y += ALTO.comida;
            _texto(ctx, `• ${x.nombre}`, M, y, { tam: 30, color: '#CBD5E1', max: ANCHO - 2 * M - 200 });
            _texto(ctx, `${formatNumber(x.kcal)} kcal`, ANCHO - M, y, { tam: 30, peso: 700, color: '#94A3B8', alinear: 'right' });
        });
        y += ALTO.comidasBuffer;
    }

    // Pie. El sitio se pinta primero y se mide: el cierre (en otro idioma puede ser largo) se queda con lo que sobra,
    // con 24 px de aire, y nunca pisa «bioboros.com» en la misma línea.
    const yp = alto - 80;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)'; ctx.fillRect(M, yp - 70, ANCHO - 2 * M, 2);
    const anchoSitio = _texto(ctx, SITIO, ANCHO - M, yp, { tam: 34, peso: 800, color: '#A5B4FC', alinear: 'right' });
    _texto(ctx, t('¿Y tú, cómo vas hoy?'), M, yp, { tam: 34, peso: 700, color: '#E2E8F0', max: ANCHO - 2 * M - anchoSitio - 24 });

    return _aBlob(canvas);
}
