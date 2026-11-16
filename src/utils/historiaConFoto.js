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

export const ANCHO = 1080;
export const ALTO = 1920;
export const ESTILOS = ['titular', 'minimal', 'cristal'];
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

/** Recorte «cover»: qué trozo de una imagen w×h llena un lienzo W×H sin deformarla, centrado. */
export function encajar(w, h, W = ANCHO, H = ALTO) {
    if (!(w > 0 && h > 0)) return { sx: 0, sy: 0, sw: 0, sh: 0 };
    const escala = Math.max(W / w, H / h);
    const sw = W / escala;
    const sh = H / escala;
    return { sx: (w - sw) / 2, sy: (h - sh) / 2, sw, sh };
}

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

/** La foto llenando el lienzo; sin foto, la noche de la app con sus dos brillos (los estilos sirven igual). */
const _fondo = (ctx, foto) => {
    const { w, h } = _dim(foto);
    if (w && h) {
        const { sx, sy, sw, sh } = encajar(w, h);
        ctx.drawImage(foto, sx, sy, sw, sh, 0, 0, ANCHO, ALTO);
        return;
    }
    const fondo = ctx.createLinearGradient(0, 0, ANCHO * 0.4, ALTO);
    fondo.addColorStop(0, '#0B1120'); fondo.addColorStop(0.5, '#1E1B4B'); fondo.addColorStop(1, '#312E81');
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, ANCHO, ALTO);
    [[ANCHO * 0.9, 260, 820, '236, 72, 153', 0.34], [80, ALTO * 0.55, 760, '99, 102, 241', 0.42], [ANCHO * 0.7, ALTO, 800, '245, 158, 11', 0.24]]
        .forEach(([x, y, r, rgb, a]) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${rgb}, ${a})`); g.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.fillStyle = g; ctx.fillRect(0, 0, ANCHO, ALTO);
        });
};

const _cabecera = (ctx, r) => {
    _velo(ctx, 0, 460, 0.6, 0);
    const y = SEGURO.arriba;
    _brote(ctx, M, y - 42, 50, BLANCO);
    _texto(ctx, BRAND.toUpperCase(), M + 62, y, { tam: 32, peso: 800 });
    _texto(ctx, fechaLarga(r.fecha), ANCHO - M, y, { tam: 28, peso: 600, color: CLARO, alinear: 'right', max: ANCHO / 2 });
};

const _valorMacro = (mc) => `${formatNumber(mc.valor)} g`;

// ── «titular»: la cifra de portada ──────────────────────────────────────────────────────────────────────
const _titular = (ctx, r) => {
    _velo(ctx, ALTO * 0.42, ALTO, 0, 0.82);
    const cal = r.calorias;
    const conMeta = cal.meta > 0;
    _texto(ctx, SITIO, M, BASE, { tam: 30, peso: 700, color: TENUE });
    _texto(ctx, t('¿Y tú, cómo vas hoy?'), ANCHO - M, BASE, { tam: 30, peso: 600, color: TENUE, alinear: 'right', max: ANCHO / 2 });

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
        _barra(ctx, M, BASE - 306, ANCHO - 2 * M, 16, cal.pct, COLOR.calories);
        _texto(ctx, `/ ${formatNumber(cal.meta)} kcal`, M, BASE - 336, { tam: 34, peso: 600, color: CLARO });
        _texto(ctx, formatPercent(cal.pct), ANCHO - M, BASE - 336, { tam: 38, peso: 800, color: COLOR.calories[0], alinear: 'right' });
        yNumero = BASE - 410;
    }
    const cifra = formatNumber(cal.valor);
    const tam = cifra.length > 5 ? 200 : 250;
    const ancho = _texto(ctx, cifra, M - 6, yNumero, { tam, peso: 800 });
    _texto(ctx, 'kcal', M + ancho + 14, yNumero, { tam: 64, peso: 700, color: COLOR.calories[0] });
    _rotulo(ctx, t('Mi día'), M, yNumero - tam * 0.86, { tam: 32, color: COLOR.calories[0], aire: 0.3 });
};

// ── «minimal»: solo las cifras, centradas (tipo sticker) ────────────────────────────────────────────────
const _minimal = (ctx, r) => {
    _velo(ctx, ALTO * 0.48, ALTO, 0, 0.72);
    const cx = ANCHO / 2;
    const marca = BRAND.toUpperCase();
    ctx.save(); ctx.font = `800 30px ${FUENTE}`; const anchoMarca = ctx.measureText(marca).width; ctx.restore();
    _brote(ctx, cx - (anchoMarca + 52) / 2, BASE - 36, 42, BLANCO);
    _texto(ctx, marca, cx - (anchoMarca + 52) / 2 + 52, BASE, { tam: 30, peso: 800 });

    const col = (ANCHO - 2 * M) / 3;
    r.macros.forEach((mc, i) => {
        const x = M + col / 2 + i * col;
        _rotulo(ctx, mc.etiqueta, x, BASE - 200, { tam: 24, alinear: 'center', max: col - 24 });
        _texto(ctx, _valorMacro(mc), x, BASE - 126, { tam: 64, peso: 800, alinear: 'center' });
    });
    _rotulo(ctx, r.calorias.etiqueta, cx, BASE - 510, { tam: 28, alinear: 'center', aire: 0.3 });
    _texto(ctx, formatNumber(r.calorias.valor), cx, BASE - 340, { tam: 190, peso: 800, alinear: 'center' });
    if (r.calorias.meta > 0) {
        _texto(ctx, `/ ${formatNumber(r.calorias.meta)} kcal · ${formatPercent(r.calorias.pct)}`, cx, BASE - 272, { tam: 30, peso: 600, color: CLARO, alinear: 'center' });
    }
};

// ── «cristal»: tarjeta esmerilada con el anillo ─────────────────────────────────────────────────────────
const _cristal = (ctx, r, canvas) => {
    const alto = 500;
    const x = M - 12, w = ANCHO - 2 * (M - 12), y = BASE - 70 - alto;
    // El esmerilado sin `ctx.filter` (Safari no lo trae): la escena reducida a 1/20 y estirada de vuelta, dentro de la tarjeta.
    try {
        const mini = document.createElement('canvas');
        mini.width = Math.round(ANCHO / 20); mini.height = Math.round(ALTO / 20);
        const mc = mini.getContext('2d');
        mc.drawImage(canvas, 0, 0, mini.width, mini.height);
        ctx.save();
        _rect(ctx, x, y, w, alto, 56); ctx.clip();
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(mini, 0, 0, mini.width, mini.height, 0, 0, ANCHO, ALTO);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'; ctx.fillRect(x, y, w, alto);
        const brillo = ctx.createLinearGradient(x, y, x + w, y + alto);
        brillo.addColorStop(0, 'rgba(255, 255, 255, 0.16)'); brillo.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = brillo; ctx.fillRect(x, y, w, alto);
        ctx.restore();
    } catch {
        ctx.save(); ctx.fillStyle = 'rgba(15, 23, 42, 0.72)'; _rect(ctx, x, y, w, alto, 56); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'; ctx.lineWidth = 2; _rect(ctx, x + 1, y + 1, w - 2, alto - 2, 55); ctx.stroke(); ctx.restore();

    const cal = r.calorias;
    const cx = x + 232, cy = y + alto / 2;
    _anillo(ctx, cx, cy, 150, 28, cal.meta > 0 ? cal.pct : 100, COLOR.calories);
    _texto(ctx, formatNumber(cal.valor), cx, cy + 20, { tam: 84, peso: 800, alinear: 'center', sombra: false });
    _texto(ctx, 'kcal', cx, cy + 64, { tam: 28, peso: 600, color: CLARO, alinear: 'center', sombra: false });
    if (cal.meta > 0) _texto(ctx, formatPercent(cal.pct), cx, cy - 62, { tam: 30, peso: 800, color: COLOR.calories[0], alinear: 'center', sombra: false });

    const x0 = x + 450, ancho = x + w - 56 - x0;
    r.macros.forEach((mc, i) => {
        const yy = y + 118 + i * 132;
        _texto(ctx, mc.etiqueta, x0, yy, { tam: 30, peso: 700, color: CLARO, max: ancho - 190, sombra: false });
        _texto(ctx, mc.meta > 0 ? `${formatNumber(mc.valor)} / ${formatNumber(mc.meta)} g` : _valorMacro(mc), x0 + ancho, yy,
            { tam: 30, peso: 800, alinear: 'right', sombra: false });
        _barra(ctx, x0, yy + 24, ancho, 14, mc.meta > 0 ? mc.pct : 100, COLOR[mc.clave]);
    });
    _velo(ctx, BASE - 60, ALTO, 0, 0.5);
    _texto(ctx, SITIO, ANCHO / 2, BASE, { tam: 30, peso: 700, color: CLARO, alinear: 'center' });
};

const _PINTAR = { titular: _titular, minimal: _minimal, cristal: _cristal };

const _aBlob = (canvas) => new Promise((resolve) => {
    let listo = false;
    const fin = (b) => { if (!listo) { listo = true; clearTimeout(tope); resolve(b || null); } };
    const tope = setTimeout(() => fin(null), 6000);
    try { canvas.toBlob(fin, 'image/jpeg', 0.92); } catch { fin(null); }
});

/** El JPEG de la historia (o null sin canvas 2D: jsdom, WebView rara). `foto`: lo que devuelve `cargarFoto`, o null. */
export async function dibujarHistoriaConFoto(r, { foto = null, estilo = 'titular' } = {}) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = ANCHO; canvas.height = ALTO;
    let ctx = null;
    try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return null;
    try {
        await Promise.race([
            Promise.all([document.fonts?.load?.(`800 64px ${FUENTE}`), document.fonts?.load?.(`700 32px ${FUENTE}`), document.fonts?.load?.(`600 32px ${FUENTE}`)].filter(Boolean)),
            new Promise((ok) => setTimeout(ok, 1500)),
        ]);
    } catch { /* la fuente del sistema sirve */ }
    try {
        _fondo(ctx, foto);
        _cabecera(ctx, r);
        (_PINTAR[estilo] || _titular)(ctx, r, canvas);
    } catch { return null; }
    return _aBlob(canvas);
}
