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
// [P1-PLAN-LOTE-300 · 2026-09-25] Rediseño (el dueño: «más visual, más atractivo y profesional»): anillo grande de
// calorías, tres anillos de macros, el brote de la marca. Formato 4:5 (1080×1350, el que mejor luce en WhatsApp e
// Instagram) o historia 9:16 (1080×1920), con el contenido centrado en vertical si sobra alto.
const ALTO = { cabecera: 250, anillo: 520, macros: 330, microsCab: 110, microFila: 112, comidasCab: 90, comida: 58, pie: 190, comidasBuffer: 50 };
export const FORMATOS = { publicacion: 1350, historia: 1920 };
const COLOR = {
    calories: ['#FCD34D', '#F59E0B'], protein: ['#93C5FD', '#3B82F6'], carbs: ['#6EE7B7', '#10B981'], fats: ['#F9A8D4', '#EC4899'],
};
// La tinta de la imagen. Colores FIJOS a propósito: esto es un PNG con su propio fondo oscuro que viaja a WhatsApp,
// no estilo de la interfaz, así que el tema de la app no le aplica (P1_shelf_chip_veil vigila los helpers que SÍ
// pintan UI con estilos inline). Con nombre, además, se lee qué papel tiene cada tono.
const TINTA = {
    blanco: '#FFFFFF',    // las cifras
    texto: '#E2E8F0',     // etiquetas y cierre
    suave: '#CBD5E1',     // nombres de las comidas
    apagado: '#94A3B8',   // fecha, metas y notas
    marca: '#A5B4FC',     // BIOBOROS y el sitio
    micros: '#C4B5FD',    // el título «Micros»
    calorias: '#FCD34D',  // etiqueta y % de las calorías
};
// La etiqueta «máx.» de los techos (la de MicrosList en la app): píldora en mayúsculas junto al nombre del micro.
const ETIQUETA = { tam: 20, padX: 9, alto: 30, radio: 6, aire: 10 };

/** Alto del CONTENIDO (sin relleno de formato). */
export function altoDelContenido(r) {
    let h = ALTO.cabecera + ALTO.anillo + ALTO.macros + ALTO.pie;
    if (r.micros.length) h += ALTO.microsCab + Math.ceil(r.micros.length / 2) * ALTO.microFila;
    if (r.comidas.length) h += ALTO.comidasCab + Math.min(r.comidas.length, 6) * ALTO.comida + ALTO.comidasBuffer;
    return h;
}

/** Alto del lienzo: el del formato, o el del contenido si no cabe (nunca se recorta nada). */
export function altoDeLaTarjeta(r, formato = 'publicacion') {
    return Math.max(FORMATOS[formato] || FORMATOS.publicacion, altoDelContenido(r));
}

/** Arco de progreso con extremos redondeados; empieza arriba y va en el sentido del reloj. */
const _anillo = (ctx, cx, cy, radio, grosor, pct, [c1, c2]) => {
    ctx.save();
    ctx.lineWidth = grosor;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.beginPath(); ctx.arc(cx, cy, radio, 0, Math.PI * 2); ctx.stroke();
    const frac = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
    if (frac > 0) {
        const g = ctx.createLinearGradient(cx - radio, cy - radio, cx + radio, cy + radio);
        g.addColorStop(0, c1); g.addColorStop(1, c2);
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, radio, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2 - (frac >= 1 ? 0.0001 : 0));
        ctx.stroke();
    }
    ctx.restore();
};

/** El brote de la marca (el mismo dibujo que el icono de la app), en `tam` px con la esquina en (x, y). */
const _brote = (ctx, x, y, tam, color) => {
    const k = tam / 24;
    ctx.save();
    ctx.translate(x, y); ctx.scale(k, k);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(12, 12.2); ctx.lineTo(12, 21); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, 12.2); ctx.bezierCurveTo(12, 8.6, 9.2, 6.6, 4.6, 6.6); ctx.bezierCurveTo(4.6, 10.2, 7.4, 12.2, 12, 12.2); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, 12.2); ctx.bezierCurveTo(12, 8.6, 14.8, 6.6, 19.4, 6.6); ctx.bezierCurveTo(19.4, 10.2, 16.6, 12.2, 12, 12.2); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(12, 4.1, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
};

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
const _texto = (ctx, s, x, y, { tam = 32, peso = 600, color = TINTA.texto, alinear = 'left', max = null } = {}) => {
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
    ctx.fillStyle = TINTA.apagado;
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

export async function dibujarTarjetaDelDia(r, { formato = 'publicacion' } = {}) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const alto = altoDeLaTarjeta(r, formato);
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

    // Fondo: la noche de la app con dos brillos (índigo arriba, esmeralda abajo).
    const fondo = ctx.createLinearGradient(0, 0, ANCHO * 0.4, alto);
    fondo.addColorStop(0, '#0B1120'); fondo.addColorStop(0.55, '#111827'); fondo.addColorStop(1, '#1E1B4B');
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, ANCHO, alto);
    const brillo = ctx.createRadialGradient(ANCHO * 0.85, 0, 0, ANCHO * 0.85, 0, 760);
    brillo.addColorStop(0, 'rgba(99, 102, 241, 0.38)'); brillo.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = brillo; ctx.fillRect(0, 0, ANCHO, alto);
    const brillo2 = ctx.createRadialGradient(0, alto, 0, 0, alto, 720);
    brillo2.addColorStop(0, 'rgba(16, 185, 129, 0.16)'); brillo2.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = brillo2; ctx.fillRect(0, 0, ANCHO, alto);

    // Si el formato es más alto que el contenido (historia), el contenido va centrado; el pie queda abajo.
    const sobra = Math.max(0, alto - altoDelContenido(r));
    let y = 110 + Math.round(sobra / 2);

    // Cabecera: el brote + la marca, la fecha, «Mi día».
    _brote(ctx, M, y - 42, 50, TINTA.marca);
    _texto(ctx, BRAND.toUpperCase(), M + 62, y, { tam: 32, peso: 800, color: TINTA.marca });
    _texto(ctx, fechaLarga(r.fecha), ANCHO - M, y, { tam: 30, peso: 600, color: TINTA.apagado, alinear: 'right' });
    y += 90;
    _texto(ctx, t('Mi día'), M, y, { tam: 72, peso: 800, color: TINTA.blanco });
    y += 50;
    _texto(ctx, tn(r.comidasRegistradas, '{n} comida registrada', '{n} comidas registradas', { n: r.comidasRegistradas }), M, y, { tam: 30, color: TINTA.apagado });

    // Calorías: el anillo grande, con la cifra dentro.
    const cal = r.calorias;
    const cy = y + 60 + 220;
    _anillo(ctx, ANCHO / 2, cy, 200, 36, cal.pct, COLOR.calories);
    _texto(ctx, formatNumber(cal.valor), ANCHO / 2, cy + 18, { tam: 104, peso: 800, color: TINTA.blanco, alinear: 'center' });
    if (cal.meta > 0) {
        _texto(ctx, `/ ${formatNumber(cal.meta)} kcal`, ANCHO / 2, cy + 70, { tam: 34, peso: 600, color: TINTA.apagado, alinear: 'center' });
        _texto(ctx, formatPercent(cal.pct), ANCHO / 2, cy - 88, { tam: 38, peso: 800, color: TINTA.calorias, alinear: 'center' });
    } else {
        _texto(ctx, 'kcal', ANCHO / 2, cy + 70, { tam: 34, peso: 600, color: TINTA.apagado, alinear: 'center' });
    }
    y += ALTO.anillo;

    // Macros: tres anillos con su porcentaje dentro, y debajo el nombre y «78 / 134 g».
    const cols = [ANCHO / 2 - 330, ANCHO / 2, ANCHO / 2 + 330];
    const my = y + 110;
    r.macros.forEach((mc, i) => {
        const cx = cols[i];
        _anillo(ctx, cx, my, 92, 18, mc.pct, COLOR[mc.clave]);
        _texto(ctx, mc.meta > 0 ? formatPercent(mc.pct) : `${formatNumber(mc.valor)} g`, cx, my + 14,
            { tam: mc.meta > 0 ? 40 : 34, peso: 800, color: TINTA.blanco, alinear: 'center' });
        _texto(ctx, mc.etiqueta, cx, my + 150, { tam: 32, peso: 700, color: TINTA.texto, alinear: 'center', max: 300 });
        _texto(ctx, mc.meta > 0 ? `${formatNumber(mc.valor)} / ${formatNumber(mc.meta)} g` : `${formatNumber(mc.valor)} g`,
            cx, my + 196, { tam: 30, peso: 700, color: TINTA.apagado, alinear: 'center', max: 300 });
    });
    y += ALTO.macros;

    // Micros (solo si hay datos: nunca una barra contra un cero inventado)
    if (r.micros.length) {
        y += 80;
        _texto(ctx, t('Micros'), M, y, { tam: 38, peso: 800, color: TINTA.micros });
        if (r.cobertura.con_datos < r.cobertura.total) {
            _texto(ctx, t('(micros de {n} de {total} comidas)', { n: r.cobertura.con_datos, total: r.cobertura.total }),
                ANCHO - M, y, { tam: 26, color: TINTA.apagado, alinear: 'right' });
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
            const anchoValor = _texto(ctx, valor, x + col, yy, { tam: 28, peso: 800, color: TINTA.blanco, alinear: 'right', max: col * 0.62 });
            const maximo = f.techo ? t('máx.') : '';
            const anchoEtiqueta = maximo ? _anchoEtiqueta(ctx, maximo) + ETIQUETA.aire : 0;
            const anchoNombre = _texto(ctx, f.label, x, yy, {
                tam: 30, peso: 700, color: TINTA.texto, max: Math.max(60, col - anchoValor - 16 - anchoEtiqueta),
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
        _texto(ctx, t('Lo que comí'), M, y, { tam: 36, peso: 800, color: TINTA.texto });
        y += ALTO.comidasCab - 70;
        r.comidas.slice(0, 6).forEach((x) => {
            y += ALTO.comida;
            _texto(ctx, `• ${x.nombre}`, M, y, { tam: 30, color: TINTA.suave, max: ANCHO - 2 * M - 200 });
            _texto(ctx, `${formatNumber(x.kcal)} kcal`, ANCHO - M, y, { tam: 30, peso: 700, color: TINTA.apagado, alinear: 'right' });
        });
        y += ALTO.comidasBuffer;
    }

    // Pie. El sitio se pinta primero y se mide: el cierre (en otro idioma puede ser largo) se queda con lo que sobra,
    // con 24 px de aire, y nunca pisa «bioboros.com» en la misma línea.
    const yp = alto - 80;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)'; ctx.fillRect(M, yp - 70, ANCHO - 2 * M, 2);
    const anchoSitio = _texto(ctx, SITIO, ANCHO - M, yp, { tam: 34, peso: 800, color: TINTA.marca, alinear: 'right' });
    _texto(ctx, t('¿Y tú, cómo vas hoy?'), M, yp, { tam: 34, peso: 700, color: TINTA.texto, max: ANCHO - 2 * M - anchoSitio - 24 });

    return _aBlob(canvas);
}
