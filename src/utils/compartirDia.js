// [P1-COMPARTIR-DIA · 2026-09-23] Compartir las macros y micros del día («para mandárselo a amigos por WhatsApp,
// así se motivan», el dueño). TODO ocurre en el dispositivo: nada pasa por el servidor.
//
// Tres caminos, en este orden: la hoja del sistema con IMAGEN + texto (web móvil, escritorio con Web Share, iOS
// nativo); la hoja con solo texto; y, si no hay Web Share —la WebView de Android no lo trae (lote 166)—, el que
// llama decide ofrecer WhatsApp (`wa.me`) y copiar. `navigator.share` exige el gesto del usuario vivo: la imagen se
// dibuja ANTES (al abrir la hoja) y aquí no se espera nada antes de llamar a `share`.
import { t, formatDate, formatNumber, formatPercent } from '../i18n';
import { formatoMicro, filasMicros } from '../components/dashboard/microsShared';
import { BRAND } from '../data/routeMeta';
import { SITE_DOMAIN } from '../config/site';

// El pie de la imagen y el cierre del texto: el dominio sale de SU SSOT (`config/site.js`, P1-DOMAIN-CUTOVER-BIOBOROS),
// no de un literal que el próximo cambio de dominio olvidaría. `SITIO` queda como alias: lo importa `tarjetaDelDia.js`.
export const SITIO = SITE_DOMAIN;
const LLENO = '▰';
const VACIO = '▱';

/** «▰▰▰▰▰▰▱▱▱▱»: `pct` en puntos (59 = 59 %), acotado a [0, 100]. */
export function barraTexto(pct, casillas = 10) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    const llenas = Math.round((p / 100) * casillas);
    return LLENO.repeat(llenas) + VACIO.repeat(casillas - llenas);
}

const _pct = (valor, meta) => (meta > 0 ? Math.round((valor / meta) * 100) : 0);

/** Los números que se comparten, ya decididos: la imagen y el texto no redondean ni eligen nada. */
// [P1-PLAN-LOTE-224 · 2026-09-24] `nombrar`: cómo se LEE el nombre de cada comida (utils/nombreDeRegistro.js); por
// defecto, tal cual.
export function resumenDelDia({ consumed, metas, microMetas = null, incluirComidas = false, fecha = new Date(), nombrar = null }) {
    const c = consumed || {};
    const m = metas || {};
    const comidas = Array.isArray(c.meals) ? c.meals : [];
    const macro = (clave, etiqueta, unidad) => {
        const valor = Math.round(Number(c[clave]) || 0);
        const meta = Math.round(Number(m[clave]) || 0);
        return { clave, etiqueta, unidad, valor, meta, pct: _pct(valor, meta) };
    };
    const cobertura = c.microsCoverage || { con_datos: 0, total: comidas.length };
    const hayMicros = !!(c.micros && cobertura.con_datos > 0);
    const micros = hayMicros ? filasMicros(t).map((f) => {
        const mm = microMetas?.[f.key];
        return { ...f, valor: Number(c.micros?.[f.key]) || 0, meta: mm ? Number(mm.target) || 0 : 0, techo: mm?.kind === 'ceiling' };
    }) : [];
    return {
        fecha,
        comidasRegistradas: comidas.length,
        calorias: macro('calories', t('Calorías'), 'kcal'),
        macros: [macro('protein', t('Proteína'), 'g'), macro('carbs', t('Carbohidratos'), 'g'), macro('fats', t('Grasas'), 'g')],
        micros,
        cobertura,
        comidas: incluirComidas
            ? comidas.map((x) => {
                const crudo = String(x?.meal_name || '').trim();
                const nombre = crudo && typeof nombrar === 'function' ? String(nombrar(crudo) || crudo).trim() : crudo;
                return { nombre, kcal: Math.round(Number(x?.calories) || 0) };
            }).filter((x) => x.nombre)
            : [],
    };
}

/**
 * [P1-COMPARTIR-DIA-PASADO · 2026-09-24] Un día del Diario (`GET /api/diary/consumed/{id}?date=…` → `{meals, totals}`)
 * en la forma que lee `resumenDelDia`. Se comparten los MISMOS totales que pinta el cajón —los del servidor—, no una
 * suma rehecha aquí: la imagen no puede decir otra cifra que la pantalla desde la que se comparte.
 */
export function consumidoDelDiario(dia) {
    const meals = Array.isArray(dia?.meals) ? dia.meals : [];
    const tot = dia?.totals || {};
    return {
        calories: Number(tot.calories) || 0,
        protein: Number(tot.protein) || 0,
        carbs: Number(tot.carbs) || 0,
        fats: Number(tot.healthy_fats ?? tot.fats) || 0,
        meals,
        micros: tot.micros || null,
        microsCoverage: tot.micros_coverage || { con_datos: 0, total: meals.length },
    };
}

export const fechaLarga = (fecha) => formatDate(fecha, { weekday: 'long', day: 'numeric', month: 'long' });

const _EMOJI = { calories: '🔥', protein: '💪', carbs: '🌾', fats: '🥑' };

/** El mensaje para WhatsApp: fuente proporcional ⇒ una barra por línea, sin columnas alineadas. */
export function textoDelDia(r) {
    const n = (v) => formatNumber(v);
    const lineas = [t('📊 Mi día en {app} · {fecha}', { app: BRAND, fecha: fechaLarga(r.fecha) }), ''];
    [r.calorias, ...r.macros].forEach((mc) => {
        lineas.push(mc.meta > 0
            ? t('{emoji} {etiqueta}: {valor} / {meta} {unidad} · {pct}', {
                emoji: _EMOJI[mc.clave], etiqueta: mc.etiqueta, valor: n(mc.valor), meta: n(mc.meta), unidad: mc.unidad, pct: formatPercent(mc.pct),
            })
            : `${_EMOJI[mc.clave]} ${mc.etiqueta}: ${n(mc.valor)} ${mc.unidad}`);
        if (mc.meta > 0) lineas.push(barraTexto(mc.pct));
    });
    if (r.micros.length) {
        lineas.push('');
        const lista = r.micros.map((f) => (f.techo && f.meta
            ? t('{etiqueta} {valor} {unidad} (máx. {meta})', { etiqueta: f.label, valor: formatoMicro(f.valor, f.unit), unidad: f.unit, meta: formatoMicro(f.meta, f.unit) })
            : `${f.label} ${formatoMicro(f.valor, f.unit)}${f.meta ? `/${formatoMicro(f.meta, f.unit)}` : ''} ${f.unit}`));
        lineas.push(`🧪 ${lista.join(' · ')}`);
        if (r.cobertura.con_datos < r.cobertura.total) {
            lineas.push(t('(micros de {n} de {total} comidas)', { n: r.cobertura.con_datos, total: r.cobertura.total }));
        }
    }
    if (r.comidas.length) {
        lineas.push('', t('🍽️ Lo que comí:'));
        r.comidas.forEach((x) => lineas.push(`• ${x.nombre} (${n(x.kcal)} kcal)`));
    }
    lineas.push('', t('¿Y tú, cómo vas hoy? 💪'), SITIO);
    return lineas.join('\n');
}

export const urlWhatsApp = (texto) => `https://wa.me/?text=${encodeURIComponent(texto)}`;

export function archivoDeImagen(blob, nombre = 'mi-dia-bioboros.png') {
    if (!blob || typeof File !== 'function') return null;
    try { return new File([blob], nombre, { type: 'image/png' }); } catch { return null; }
}

export function puedeCompartirImagen(archivo) {
    try {
        return !!(archivo && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
            && navigator.canShare({ files: [archivo] }));
    } catch { return false; }
}

export const puedeCompartirTexto = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** 'compartido' | 'cancelado' (el usuario cerró la hoja) | 'fallo' (no hay Web Share o el sistema lo rechazó). */
export async function compartir({ archivo, texto }) {
    try {
        if (puedeCompartirImagen(archivo)) { await navigator.share({ files: [archivo], text: texto }); return 'compartido'; }
        if (puedeCompartirTexto()) { await navigator.share({ text: texto }); return 'compartido'; }
        return 'fallo';
    } catch (e) {
        return e?.name === 'AbortError' ? 'cancelado' : 'fallo';
    }
}
