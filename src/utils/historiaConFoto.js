// [P1-PLAN-LOTE-1048 · 2026-11-16] La historia con TU foto: la selfie del espejo de fondo y el total del día encima
// (el dueño: «que la gente lo use como trend»). 1080×1920, dibujada a mano en canvas como `tarjetaDelDia.js`.
// La foto NO sale del teléfono: se lee, se dibuja y se comparte aquí.
//
// Tres estilos sobre la misma foto: «titular» (la cifra gigante, de portada), «minimal» (solo cifras, tipo sticker)
// y «cristal» (tarjeta esmerilada con el anillo). Todo cabe en la zona segura de las historias (Instagram y
// WhatsApp tapan ~230 px arriba y ~330 abajo con su propia interfaz).
import { t, formatNumber, formatPercent } from '../i18n';
import { fechaLarga, SITIO } from './compartirDia';
import { BRAND } from '../data/routeMeta';
import { BLOQUE_INICIAL, acotarBloque, aplicarBloque, cajaTransformada } from './bloqueDeCifras';
import { definirPiezas, pintarPiezas, estadoDePieza, cajaDePieza } from './piezasDeHistoria';
import { CLAVES_DE_DISENO, disenoDe, baseDe, tintarFoto } from './disenosDeHistoria';

export const ANCHO = 1080;
export const ALTO = 1920;
// [P1-PLAN-LOTE-1095] siete diseños (uno por día) sobre las tres composiciones: `disenosDeHistoria.js`
export const ESTILOS = CLAVES_DE_DISENO;
const M = 72;
const SEGURO = { arriba: 230, abajo: 330 };
const BASE = ALTO - SEGURO.abajo;      // la última línea de texto
const FUENTE = '"Outfit", system-ui, -apple-system, "Segoe UI", sans-serif';
const COLOR = {
    calories: ['#FDE68A', '#F59E0B'], protein: ['#93C5FD', '#3B82F6'], carbs: ['#6EE7B7', '#10B981'], fats: ['#F9A8D4', '#EC4899'],
};
// Tinta FIJA: es un JPEG con su propia foto de fondo, no interfaz (mismo porqué que `tarjetaDelDia.js`).
const BLANCO = '#FFFFFF';
const CLARO = 'rgba(255, 255, 255, 0.86)';
const TENUE = 'rgba(255, 255, 255, 0.7)';

export const ZOOM_MAX = 3;
export const ENCUADRE_INICIAL = Object.freeze({ zoom: 1, x: 0, y: 0 });
const _acotar = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));

/** Recorte «cover»: qué trozo de una imagen w×h llena un lienzo W×H sin deformarla. [1048] `encuadre`: `zoom` (1 =
 *  justo llena, hasta ZOOM_MAX) y `x`/`y` en [-1, 1] (-1 = el borde izquierdo/de arriba, 0 = centrado, 1 = el otro). */
export function encajar(w, h, W = ANCHO, H = ALTO, encuadre = ENCUADRE_INICIAL) {
    if (!(w > 0 && h > 0)) return { sx: 0, sy: 0, sw: 0, sh: 0, escala: 0 };
    const escala = Math.max(W / w, H / h) * _acotar(encuadre?.zoom ?? 1, 1, ZOOM_MAX);
    const sw = W / escala;
    const sh = H / escala;
    const hx = (w - sw) / 2;
    const hy = (h - sh) / 2;
    return { sx: hx * (1 + _acotar(encuadre?.x, -1, 1)), sy: hy * (1 + _acotar(encuadre?.y, -1, 1)), sw, sh, escala };
}

/** El encuadre tras arrastrar `dx`/`dy` px DEL LIENZO (la foto sigue al dedo), o tras acercar `factor` veces. */
export function moverEncuadre(encuadre, foto, { dx = 0, dy = 0, factor = 1 } = {}) {
    const { w, h } = _dim(foto);
    const e = { ...ENCUADRE_INICIAL, ...encuadre };
    if (!(w > 0 && h > 0)) return e;
    const zoom = _acotar(e.zoom * (Number(factor) || 1), 1, ZOOM_MAX);
    const { sw, sh, escala } = encajar(w, h, ANCHO, ALTO, { ...e, zoom });
    const hx = (w - sw) / 2;
    const hy = (h - sh) / 2;
    return {
        zoom,
        x: hx > 0.5 ? _acotar(e.x - dx / escala / hx, -1, 1) : 0,
        y: hy > 0.5 ? _acotar(e.y - dy / escala / hy, -1, 1) : 0,
    };
}

/** «Meta cumplida»: el día entre el 90 % y el 110 % de las calorías de la meta. */
export const metaCumplida = (r) => r?.calorias?.meta > 0 && r.calorias.pct >= 90 && r.calorias.pct <= 110;

/** El fichero elegido, listo para `drawImage` y ya derecho (las fotos del teléfono traen la rotación en el EXIF). */
export async function cargarFoto(file) {
    if (!file) return null;
    if (typeof createImageBitmap === 'function') {
        try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* cae al <img> */ }
    }
    if (typeof Image !== 'function' || typeof URL?.createObjectURL !== 'function') return null;
    const url = URL.createObjectURL(file);
    try {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('foto ilegible'));
            img.src = url;
        });
    } catch { return null; } finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
}

const _dim = (foto) => ({ w: foto?.naturalWidth || foto?.width || 0, h: foto?.naturalHeight || foto?.height || 0 });

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

const _sombra = (ctx, fuerte = true) => {
    ctx.shadowColor = fuerte ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0)';
    ctx.shadowBlur = fuerte ? 22 : 0;
    ctx.shadowOffsetY = fuerte ? 3 : 0;
};

/** Texto con sombra (se lee sobre cualquier foto). Devuelve el ancho pintado. */
const _texto = (ctx, s, x, y, { tam = 32, peso = 700, color = BLANCO, alinear = 'left', max = null, sombra = true } = {}) => {
    ctx.save();
    ctx.font = `${peso} ${tam}px ${FUENTE}`;
    ctx.fillStyle = color;
    ctx.textAlign = alinear;
    ctx.textBaseline = 'alphabetic';
    _sombra(ctx, sombra);
    let out = String(s);
    if (max && ctx.measureText(out).width > max) {
        while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
        out = `${out.trimEnd()}…`;
    }
    ctx.fillText(out, x, y);
    const ancho = ctx.measureText(out).width;
    ctx.restore();
    return ancho;
};

/** Rótulo en MAYÚSCULAS con las letras separadas (letra a letra: `ctx.letterSpacing` no está en todos los WebView). */
const _rotulo = (ctx, s, x, y, { tam = 26, peso = 800, color = CLARO, alinear = 'left', max = null, aire = 0.16 } = {}) => {
    const letras = [...String(s).toUpperCase()];
    ctx.save();
    ctx.font = `${peso} ${tam}px ${FUENTE}`;
    const anchos = letras.map((c) => ctx.measureText(c).width);
    const suma = anchos.reduce((a, b) => a + b, 0);
    let hueco = tam * aire;
    if (max && suma + hueco * (letras.length - 1) > max) hueco = Math.max(0, (max - suma) / Math.max(1, letras.length - 1));
    const total = suma + hueco * (letras.length - 1);
    if (max && total > max) { ctx.restore(); return _texto(ctx, letras.join(''), x, y, { tam, peso, color, alinear, max }); }
    let cx = alinear === 'center' ? x - total / 2 : alinear === 'right' ? x - total : x;
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    _sombra(ctx);
    letras.forEach((c, i) => { ctx.fillText(c, cx, y); cx += anchos[i] + hueco; });
    ctx.restore();
    return total;
};

const _brote = (ctx, x, y, tam, color) => {
    const k = tam / 24;
    ctx.save();
    ctx.translate(x, y); ctx.scale(k, k);
    _sombra(ctx);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(12, 12.2); ctx.lineTo(12, 21); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, 12.2); ctx.bezierCurveTo(12, 8.6, 9.2, 6.6, 4.6, 6.6); ctx.bezierCurveTo(4.6, 10.2, 7.4, 12.2, 12, 12.2); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, 12.2); ctx.bezierCurveTo(12, 8.6, 14.8, 6.6, 19.4, 6.6); ctx.bezierCurveTo(19.4, 10.2, 16.6, 12.2, 12, 12.2); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(12, 4.1, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
};

const _barra = (ctx, x, y, w, h, pct, [c1, c2], fondo = 'rgba(255, 255, 255, 0.24)') => {
    ctx.save();
    ctx.fillStyle = fondo;
    _rect(ctx, x, y, w, h, h / 2); ctx.fill();
    const lleno = Math.max(0, Math.min(1, (Number(pct) || 0) / 100)) * w;
    if (lleno > 0) {
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, c1); g.addColorStop(1, c2);
        ctx.fillStyle = g;
        ctx.shadowColor = c2; ctx.shadowBlur = 18;      // el brillo de la barra
        _rect(ctx, x, y, Math.max(lleno, h), h, h / 2); ctx.fill();
    }
    ctx.restore();
};

const _anillo = (ctx, cx, cy, radio, grosor, pct, [c1, c2]) => {
    ctx.save();
    ctx.lineWidth = grosor; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath(); ctx.arc(cx, cy, radio, 0, Math.PI * 2); ctx.stroke();
    const frac = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
    if (frac > 0) {
        const g = ctx.createLinearGradient(cx - radio, cy - radio, cx + radio, cy + radio);
        g.addColorStop(0, c1); g.addColorStop(1, c2);
        ctx.strokeStyle = g; ctx.shadowColor = c2; ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(cx, cy, radio, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2 - (frac >= 1 ? 0.0001 : 0));
        ctx.stroke();
    }
    ctx.restore();
};

const _velo = (ctx, y0, y1, a0, a1) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(2, 6, 23, ${a0})`); g.addColorStop(1, `rgba(2, 6, 23, ${a1})`);
    ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), ANCHO, Math.abs(y1 - y0));
};

/** La píldora dorada «✓ META CUMPLIDA» con su brillo; `x` según `alinear`, `yCentro` su centro. */
const _insignia = (ctx, x, yCentro, alinear = 'left', texto = null) => {
    const s = `✓  ${texto || t('Meta cumplida')}`.toUpperCase();
    ctx.save();
    ctx.font = `800 24px ${FUENTE}`;
    const letras = [...s];
    const hueco = 24 * 0.12;
    const ancho = letras.reduce((a, c) => a + ctx.measureText(c).width, 0) + hueco * (letras.length - 1) + 2 * 22;
    const x0 = alinear === 'center' ? x - ancho / 2 : alinear === 'right' ? x - ancho : x;
    const g = ctx.createLinearGradient(x0, 0, x0 + ancho, 0);
    g.addColorStop(0, COLOR.calories[0]); g.addColorStop(1, COLOR.calories[1]);   // el oro de la paleta (mismos tonos)
    ctx.fillStyle = g; ctx.shadowColor = 'rgba(245, 158, 11, 0.7)'; ctx.shadowBlur = 26;
    _rect(ctx, x0, yCentro - 25, ancho, 50, 25); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#3B2203'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let cx = x0 + 22;
    letras.forEach((c) => { ctx.fillText(c, cx, yCentro + 1); cx += ctx.measureText(c).width + hueco; });
    ctx.restore();
};

/** La foto llenando el lienzo; sin foto, la noche de la app con sus dos brillos (los estilos sirven igual). */
const _fondo = (ctx, foto, encuadre, clave = 'titular') => {
    const { w, h } = _dim(foto);
    if (w && h) {
        const { sx, sy, sw, sh } = encajar(w, h, ANCHO, ALTO, encuadre);
        ctx.drawImage(foto, sx, sy, sw, sh, 0, 0, ANCHO, ALTO);
        tintarFoto(ctx, clave, ANCHO, ALTO);      // [1095] la luz del diseño sobre TU foto
        return;
    }
    // [1095] sin foto, la noche de cada diseño (Aurora, Pulso y Bruma: la de la app)
    const { tonos, brillos } = disenoDe(clave).noche;
    const fondo = ctx.createLinearGradient(0, 0, ANCHO * 0.4, ALTO);
    fondo.addColorStop(0, tonos[0]); fondo.addColorStop(0.5, tonos[1]); fondo.addColorStop(1, tonos[2]);
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, ANCHO, ALTO);
    [[ANCHO * 0.9, 260, 820, brillos[0], 0.34], [80, ALTO * 0.55, 760, brillos[1], 0.42], [ANCHO * 0.7, ALTO, 800, brillos[2], 0.24]]
        .forEach(([x, y, r, rgb, a]) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${rgb}, ${a})`); g.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.fillStyle = g; ctx.fillRect(0, 0, ANCHO, ALTO);
        });
};

// [P1-PLAN-LOTE-1084] La cabecera (marca y fecha) y los pies (sitio, pregunta, sello) son PIEZAS que se mueven y se
// quitan (`piezasDeHistoria.js`); aquí queda la oscuridad que las hace legibles, fija, y solo si alguna se ve.
const _veloCabecera = (ctx) => _velo(ctx, 0, 460, 0.6, 0);

const _valorMacro = (mc) => `${formatNumber(mc.valor)} g`;

// ── «titular»: la cifra de portada ──────────────────────────────────────────────────────────────────────
const _titularPie = (ctx) => _velo(ctx, BASE - 120, ALTO, 0, 0.6);
const _titular = (ctx, r, ac = COLOR.calories) => {
    const cal = r.calorias;
    const conMeta = cal.meta > 0;

    const col = (ANCHO - 2 * M) / 3;
    r.macros.forEach((mc, i) => {
        const x = M + i * col;
        _texto(ctx, _valorMacro(mc), x, BASE - 150, { tam: 60, peso: 800 });
        ctx.save();
        ctx.fillStyle = COLOR[mc.clave][0]; ctx.shadowColor = COLOR[mc.clave][1]; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(x + 9, BASE - 112, 9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        _rotulo(ctx, mc.etiqueta, x + 30, BASE - 103, { tam: 22, max: col - 50 });
    });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'; ctx.fillRect(M, BASE - 250, ANCHO - 2 * M, 2);

    let yNumero = BASE - 300;
    if (conMeta) {
        _barra(ctx, M, BASE - 306, ANCHO - 2 * M, 16, cal.pct, ac);
        _texto(ctx, `/ ${formatNumber(cal.meta)} kcal`, M, BASE - 336, { tam: 34, peso: 600, color: CLARO });
        _texto(ctx, formatPercent(cal.pct), ANCHO - M, BASE - 336, { tam: 38, peso: 800, color: ac[0], alinear: 'right' });
        yNumero = BASE - 410;
    }
    const tam = _tamTitular(r);
    const cifra = formatNumber(cal.valor);
    const ancho = _texto(ctx, cifra, M - 6, yNumero, { tam, peso: 800 });
    _texto(ctx, 'kcal', M + ancho + 14, yNumero, { tam: 64, peso: 700, color: ac[0] });
    _rotulo(ctx, t('Mi día'), M, yNumero - tam * 0.86, { tam: 32, color: ac[0], aire: 0.3 });
    if (metaCumplida(r)) _insignia(ctx, ANCHO - M, yNumero - tam * 0.86 - 11, 'right');
};

// ── «minimal»: solo las cifras, centradas (tipo sticker) ────────────────────────────────────────────────
const _minimalPie = (ctx) => _velo(ctx, BASE - 120, ALTO, 0, 0.55);
const _minimal = (ctx, r, ac = COLOR.calories) => {
    const cx = ANCHO / 2;

    const col = (ANCHO - 2 * M) / 3;
    r.macros.forEach((mc, i) => {
        const x = M + col / 2 + i * col;
        _rotulo(ctx, mc.etiqueta, x, BASE - 200, { tam: 24, alinear: 'center', max: col - 24 });
        _texto(ctx, _valorMacro(mc), x, BASE - 126, { tam: 64, peso: 800, alinear: 'center' });
    });
    _rotulo(ctx, r.calorias.etiqueta, cx, BASE - 510, { tam: 28, alinear: 'center', aire: 0.3, color: ac === COLOR.calories ? CLARO : ac[0] });
    if (metaCumplida(r)) _insignia(ctx, cx, BASE - 590, 'center');
    _texto(ctx, formatNumber(r.calorias.valor), cx, BASE - 340, { tam: 190, peso: 800, alinear: 'center' });
    if (r.calorias.meta > 0) {
        _texto(ctx, `/ ${formatNumber(r.calorias.meta)} kcal · ${formatPercent(r.calorias.pct)}`, cx, BASE - 272, { tam: 30, peso: 600, color: CLARO, alinear: 'center' });
    }
};

// ── «cristal»: tarjeta esmerilada con el anillo ─────────────────────────────────────────────────────────
const _CRISTAL = { alto: 500, x: M - 12, w: ANCHO - 2 * (M - 12), y: BASE - 70 - 500, radio: 56 };
// [1078] El esmerilado va SIN la transformación del bloque (es la escena de detrás, que no se mueve), en la tarjeta ya
// movida y escalada: `k` = { x, y, w, alto, radio } en px del lienzo.
const _cristalFondo = (ctx, canvas, k) => {
    const { x, y, w, alto, radio } = k;
    // El esmerilado sin `ctx.filter` (Safari no lo trae): la escena reducida a 1/20 y estirada de vuelta, dentro de la tarjeta.
    try {
        const mini = document.createElement('canvas');
        mini.width = Math.round(ANCHO / 20); mini.height = Math.round(ALTO / 20);
        const mc = mini.getContext('2d');
        mc.drawImage(canvas, 0, 0, mini.width, mini.height);
        ctx.save();
        _rect(ctx, x, y, w, alto, radio); ctx.clip();
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(mini, 0, 0, mini.width, mini.height, 0, 0, ANCHO, ALTO);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'; ctx.fillRect(x, y, w, alto);
        const brillo = ctx.createLinearGradient(x, y, x + w, y + alto);
        brillo.addColorStop(0, 'rgba(255, 255, 255, 0.16)'); brillo.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = brillo; ctx.fillRect(x, y, w, alto);
        ctx.restore();
    } catch {
        ctx.save(); ctx.fillStyle = 'rgba(15, 23, 42, 0.72)'; _rect(ctx, x, y, w, alto, radio); ctx.fill(); ctx.restore();
    }
};
const _cristalPie = (ctx) => _velo(ctx, BASE - 60, ALTO, 0, 0.5);
const _cristal = (ctx, r, ac = COLOR.calories) => {
    const { alto, x, w, y } = _CRISTAL;
    ctx.save(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'; ctx.lineWidth = 2; _rect(ctx, x + 1, y + 1, w - 2, alto - 2, 55); ctx.stroke(); ctx.restore();

    const cal = r.calorias;
    const cx = x + 232, cy = y + alto / 2;
    _anillo(ctx, cx, cy, 150, 28, cal.meta > 0 ? cal.pct : 100, ac);
    _texto(ctx, formatNumber(cal.valor), cx, cy + 20, { tam: 84, peso: 800, alinear: 'center', sombra: false });
    _texto(ctx, 'kcal', cx, cy + 64, { tam: 28, peso: 600, color: CLARO, alinear: 'center', sombra: false });
    if (cal.meta > 0) _texto(ctx, formatPercent(cal.pct), cx, cy - 62, { tam: 30, peso: 800, color: ac[0], alinear: 'center', sombra: false });

    const x0 = x + 450, ancho = x + w - 56 - x0;
    r.macros.forEach((mc, i) => {
        const yy = y + 118 + i * 132;
        _texto(ctx, mc.etiqueta, x0, yy, { tam: 30, peso: 700, color: CLARO, max: ancho - 190, sombra: false });
        _texto(ctx, mc.meta > 0 ? `${formatNumber(mc.valor)} / ${formatNumber(mc.meta)} g` : _valorMacro(mc), x0 + ancho, yy,
            { tam: 30, peso: 800, alinear: 'right', sombra: false });
        _barra(ctx, x0, yy + 24, ancho, 14, mc.meta > 0 ? mc.pct : 100, COLOR[mc.clave]);
    });
    if (metaCumplida(r)) _insignia(ctx, ANCHO / 2, y - 52, 'center');
};

const _PINTAR = { titular: _titular, minimal: _minimal, cristal: _cristal };
const _PIE = { titular: _titularPie, minimal: _minimalPie, cristal: _cristalPie };
// La oscuridad detrás de las cifras (se leen sobre cualquier foto): sigue al bloque. Cristal trae su propia tarjeta.
const _OSCURO = { titular: 0.82, minimal: 0.72, cristal: 0 };

// [P1-PLAN-LOTE-1082 · 2026-11-18] «Compartir mi semana»: la MISMA historia (foto, estilos, sticker, cabecera y pie) con
// otro contenido. Un resumen con `pintor` ({ pintar, caja }) dibuja lo suyo; sin él, el día de siempre.
const _pintorDe = (r) => (r?.pintor && typeof r.pintor.pintar === 'function' ? r.pintor : null);

/** Lo que otro contenido necesita para dibujar con la MISMA tinta que el día (la semana: `historiaDeSemana.js`). */
export const PINCEL = Object.freeze({
    texto: (...a) => _texto(...a), rotulo: (...a) => _rotulo(...a), rect: (...a) => _rect(...a), barra: (...a) => _barra(...a),
    anillo: (...a) => _anillo(...a), insignia: (...a) => _insignia(...a), brote: (...a) => _brote(...a),
    fechaLarga: (f) => fechaLarga(f), preguntaDelDia: () => t('¿Y tú, cómo vas hoy?'),
    M, BASE, SEGURO, FUENTE, BLANCO, CLARO, TENUE, COLOR, CRISTAL: _CRISTAL, ANCHO, ALTO, MARCA: BRAND, SITIO,
});

// Medir sin el lienzo de la historia (la hoja necesita las cajas de las piezas para saber qué tocó el dedo).
let _ctxMedida = null;
const _medir = (s, tam, peso) => {
    try {
        if (!_ctxMedida && typeof document !== 'undefined') _ctxMedida = document.createElement('canvas').getContext('2d');
    } catch { _ctxMedida = null; }
    if (_ctxMedida && typeof _ctxMedida.measureText === 'function') {
        _ctxMedida.font = `${peso} ${tam}px ${FUENTE}`;
        const w = _ctxMedida.measureText(String(s)).width;
        if (w > 0) return w;
    }
    return String(s).length * tam * 0.56;
};

/** [1084] Las piezas (textos sueltos) de la historia en ese estilo: `{ id, pie, caja, pintar }`. */
export const piezasDeLaHistoria = (r, estilo = 'titular') => definirPiezas(r, baseDe(estilo), PINCEL, _medir);

function _tamTitular(r) { return formatNumber(r?.calorias?.valor ?? 0).length > 5 ? 200 : 250; }

/** [1078] Dónde pueden ir las cifras: bajo la cabecera y por encima del pie (lo que tapan las historias). */
// [P1-PLAN-LOTE-1097] libre (como un sticker de Instagram): toda la imagen; solo el centro del resumen queda dentro
export const LIMITES_CIFRAS = Object.freeze({ x0: 0, x1: ANCHO, y0: 0, y1: ALTO, libre: true });

/** [1078] La caja de las cifras de cada estilo en su sitio de siempre, en px del lienzo: lo que se arrastra y escala. */
export function cajaDeCifras(r, clave = 'titular') {
    const estilo = baseDe(clave);     // [1095] la caja es de la composición, no del diseño
    const pintor = _pintorDe(r);
    if (pintor) return pintor.caja(r, estilo);
    const cumplida = metaCumplida(r);
    if (estilo === 'minimal') {
        const y0 = cumplida ? BASE - 590 - 30 : BASE - 510 - 30;
        return { x: M, y: y0, w: ANCHO - 2 * M, h: BASE - 108 - y0 };
    }
    if (estilo === 'cristal') {
        const y0 = cumplida ? _CRISTAL.y - 52 - 30 : _CRISTAL.y;
        return { x: _CRISTAL.x, y: y0, w: _CRISTAL.w, h: _CRISTAL.y + _CRISTAL.alto - y0 };
    }
    const yNumero = r?.calorias?.meta > 0 ? BASE - 410 : BASE - 300;
    const y0 = yNumero - _tamTitular(r) * 0.86 - 44;
    return { x: M - 12, y: y0, w: ANCHO - 2 * M + 16, h: BASE - 92 - y0 };
}

/** Un punto del sitio de siempre, tal como queda con el bloque (escala alrededor del centro de la caja). */
const _punto = (caja, b, x, y) => {
    const cx = caja.x + caja.w / 2;
    const cy = caja.y + caja.h / 2;
    return { x: cx + b.dx + (x - cx) * b.escala, y: cy + b.dy + (y - cy) * b.escala };
};

// [P1-PLAN-LOTE-1097] «El sombreado del resumen choca»: era una FRANJA oscura de lado a lado con bordes rectos. Ahora
// una sombra redonda y suave solo alrededor del resumen (una elipse que se funde con la foto), menos densa.
const _veloDelBloque = (ctx, c, a) => {
    if (!(a > 0)) return;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const rx = Math.max(1, c.w * 0.72);
    const ry = Math.max(1, c.h * 0.95);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    const k = a * 0.7;
    g.addColorStop(0, `rgba(2, 6, 23, ${k})`);
    g.addColorStop(0.55, `rgba(2, 6, 23, ${k * 0.75})`);
    g.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    ctx.restore();
};

/** Solo en la vista previa, mientras se mueven las cifras: su contorno y, centradas, la línea del centro. */
const _guia = (ctx, c, centrado, radio = 28) => {
    ctx.save();
    ctx.setLineDash?.([18, 12]);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 8;
    _rect(ctx, c.x - 14, c.y - 14, c.w + 28, c.h + 28, radio); ctx.stroke();
    if (centrado) {
        ctx.setLineDash?.([]);
        ctx.strokeStyle = 'rgba(165, 180, 252, 0.95)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ANCHO / 2, SEGURO.arriba + 20); ctx.lineTo(ANCHO / 2, BASE - 40); ctx.stroke();
    }
    ctx.restore();
};

const _aBlob = (canvas) => new Promise((resolve) => {
    let listo = false;
    const fin = (b) => { if (!listo) { listo = true; clearTimeout(tope); resolve(b || null); } };
    const tope = setTimeout(() => fin(null), 6000);
    try { canvas.toBlob(fin, 'image/jpeg', 0.92); } catch { fin(null); }
});

/** Espera (como mucho 1,5 s) a que Outfit esté lista: un lienzo pintado antes sale con la fuente del sistema. */
export async function cargarFuentes() {
    if (typeof document === 'undefined') return;
    try {
        await Promise.race([
            Promise.all([document.fonts?.load?.(`800 64px ${FUENTE}`), document.fonts?.load?.(`700 32px ${FUENTE}`), document.fonts?.load?.(`600 32px ${FUENTE}`)].filter(Boolean)),
            new Promise((ok) => setTimeout(ok, 1500)),
        ]);
    } catch { /* la fuente del sistema sirve */ }
}

/** Pinta la historia en `canvas` (lo pone a 1080×1920), SIN esperar nada: la vista previa en vivo repinta al arrastrar.
 *  Devuelve false si no hay canvas 2D o el dibujo falló. */
export function pintarHistoria(canvas, r, { foto = null, estilo = 'titular', encuadre = ENCUADRE_INICIAL, bloque = BLOQUE_INICIAL, guia = null, piezas = null } = {}) {
    if (!canvas) return false;
    if (canvas.width !== ANCHO) canvas.width = ANCHO;
    if (canvas.height !== ALTO) canvas.height = ALTO;
    let ctx = null;
    try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return false;
    try {
        ctx.clearRect(0, 0, ANCHO, ALTO);
        const clave = ESTILOS.includes(estilo) ? estilo : 'titular';
        _fondo(ctx, foto, encuadre, clave);
        const cual = baseDe(clave);       // [1095] la composición del diseño
        const acento = disenoDe(clave).acento || COLOR.calories;
        // [1084] los textos sueltos: sus velos (fijos) si alguna se ve; las piezas se pintan al final, encima de todo
        const defs = piezasDeLaHistoria(r, cual);
        const seVe = (d) => !estadoDePieza(piezas, d.id).oculta;
        if (defs.some((d) => !d.pie && seVe(d))) _veloCabecera(ctx);
        // [1078] las cifras son un sticker: su caja de siempre, movida y escalada por `bloque` (acotado a sus límites)
        const caja = cajaDeCifras(r, cual);
        const b = acotarBloque(bloque, caja, LIMITES_CIFRAS);
        const movida = cajaTransformada(caja, b);
        _veloDelBloque(ctx, movida, _OSCURO[cual]);
        if (defs.some((d) => d.pie && seVe(d))) _PIE[cual](ctx);
        if (cual === 'cristal') {
            const p = _punto(caja, b, _CRISTAL.x, _CRISTAL.y);
            _cristalFondo(ctx, canvas, { x: p.x, y: p.y, w: _CRISTAL.w * b.escala, alto: _CRISTAL.alto * b.escala, radio: _CRISTAL.radio * b.escala });
        }
        ctx.save();
        aplicarBloque(ctx, caja, b);
        const pintor = _pintorDe(r);
        if (pintor) pintor.pintar(ctx, r, cual, acento); else _PINTAR[cual](ctx, r, acento);
        ctx.restore();
        pintarPiezas(ctx, defs, piezas);
        const guiada = guia?.pieza ? defs.find((d) => d.id === guia.pieza) : null;
        if (guiada) _guia(ctx, cajaDePieza(guiada, piezas), false, 18);
        else if (guia) _guia(ctx, movida, !!guia.centrado && Math.abs(b.dx) < 0.5);
        return true;
    } catch { return false; }
}

/** El JPEG de la historia (o null sin canvas 2D: jsdom, WebView rara). `foto`: lo que devuelve `cargarFoto`, o null. */
export async function dibujarHistoriaConFoto(r, { foto = null, estilo = 'titular', encuadre = ENCUADRE_INICIAL, bloque = BLOQUE_INICIAL, piezas = null } = {}) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    await cargarFuentes();
    if (!pintarHistoria(canvas, r, { foto, estilo, encuadre, bloque, piezas })) return null;
    return _aBlob(canvas);
}
