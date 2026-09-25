// [P1-PLAN-LOTE-224 · 2026-09-24] La cantidad de un ingrediente del escáner de comida: leerla como la teclea la gente,
// moverla con −/+ a pasos que tengan sentido para su unidad y escribirla de vuelta (en pantalla y para el servidor).
//
// EL DEFECTO QUE LA ORIGINA (un tester de Android, con captura): el campo era `type="number"` controlado con el número
// del estado, y `Number('')` es 0. Al borrar la cantidad para escribir otra, el 0 volvía al instante y lo tecleado
// quedaba detrás: «010». Aquí el texto y el número se separan (ver `QuantityStepper`): el campo puede quedar vacío
// mientras se escribe, y estas funciones deciden qué es un número y cuál es el siguiente paso.
//
// Sin React ni DOM: se prueban solas.
import { formatNumber } from '../i18n';

const GRAMOS = new Set(['g', 'gr', 'gramo', 'gramos', 'ml']);
const LIBRAS = new Set(['lb', 'lbs', 'libra', 'libras']);
const TAZAS = new Set(['taza', 'tazas']);
// Símbolos: no tienen plural («2 g», «2 lb»). Mismo criterio que `_UNIDADES_NO_TRADUCIBLES` (shoppingHelpers.js).
const SIMBOLOS = new Set(['g', 'gr', 'ml', 'lb', 'lbs', 'kg', 'l', 'oz']);
// Plurales que la regla general (vocal → +s, consonante → +es) escribiría mal.
const PLURALES_ESPECIALES = { 'porción': 'porciones', porcion: 'porciones', 'ración': 'raciones', racion: 'raciones' };

const clave = (unidad) => String(unidad || '').trim().toLowerCase();

/** El tope de una cantidad: el mismo orden de magnitud que el saneado del servidor (`_sane_item_qty`). */
export function topeDeCantidad(unidad) {
    const u = clave(unidad);
    if (GRAMOS.has(u)) return 5000;
    if (LIBRAS.has(u)) return 20;
    return 99;
}

/** Hasta dónde baja el «−». Para quitar un ingrediente del todo está su casilla (o escribir 0). */
export function minimoDeCantidad(unidad) {
    const u = clave(unidad);
    if (GRAMOS.has(u)) return 5;
    if (LIBRAS.has(u) || TAZAS.has(u)) return 0.25;
    return 0.5;
}

/**
 * Lo tecleado, como número: «1,5», «1.5», «.5», «1/2», «1 1/2», «0». Vacío, a medias sin número o basura → `null`
 * (el llamante conserva la cantidad anterior). La coma vale igual que el punto: el teclado decimal de Android pone el
 * separador del idioma del teléfono.
 */
export function leerCantidad(texto) {
    const s = String(texto ?? '').trim().replace(',', '.');
    if (!s) return null;
    let n = null;
    let m;
    if (/^\d+(\.\d*)?$/.test(s) || /^\.\d+$/.test(s)) n = Number(s);
    else if ((m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s))) n = Number(m[3]) > 0 ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null;
    else if ((m = /^(\d+)\/(\d+)$/.exec(s))) n = Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/** ¿Se deja escribir esto en el campo? Dígitos, un separador decimal, una barra de fracción y espacios; corto. */
export function esCantidadEnCurso(texto) {
    const s = String(texto ?? '');
    if (s.length > 7) return false;
    if (!/^[\d\s.,/]*$/.test(s)) return false;
    return (s.match(/[.,]/g) || []).length <= 1 && (s.match(/\//g) || []).length <= 1;
}

const _dos = (n) => Math.round(n * 100) / 100;

/** Una cantidad calculada (una porción de 1½×, p. ej.) con la precisión que tiene sentido para su unidad. */
export function redondearCantidad(q, unidad) {
    const n = Number(q);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const u = clave(unidad);
    if (GRAMOS.has(u)) return Math.max(1, Math.round(n));
    return Math.max(0.25, Math.round(n * 4) / 4);
}

/**
 * El valor siguiente del «+» (`dir` = 1) o del «−» (`dir` = -1). Pasos por unidad: 10 g (25 desde 100, 50 desde 500),
 * un cuarto de libra, media taza (un cuarto por debajo de la media) y una pieza (media por debajo de una). Se salta al
 * múltiplo del paso: de 1,5 huevos, «+» da 2 y «−» da 1.
 */
export function pasoDeCantidad(q, unidad, dir) {
    const n = Number.isFinite(Number(q)) ? Math.max(0, Number(q)) : 0;
    const u = clave(unidad);
    const sube = dir > 0;
    let paso;
    if (GRAMOS.has(u)) {
        const ref = sube ? n : n - 1e-9;
        paso = ref < 100 ? 10 : ref < 500 ? 25 : 50;
    } else if (LIBRAS.has(u)) {
        paso = 0.25;
    } else if (TAZAS.has(u)) {
        paso = (sube ? n < 0.5 : n <= 0.5) ? 0.25 : 0.5;
    } else {
        paso = (sube ? n < 1 : n <= 1) ? 0.5 : 1;
    }
    const siguiente = sube
        ? (Math.floor(n / paso + 1e-9) + 1) * paso
        : (Math.ceil(n / paso - 1e-9) - 1) * paso;
    return _dos(Math.min(topeDeCantidad(u), Math.max(minimoDeCantidad(u), siguiente)));
}

/** Para pintar: con el separador decimal del idioma y sin ceros de más («1,5» en francés, «1.5» en es-DO). */
export function formatearCantidad(q) {
    const n = Number(q);
    if (!Number.isFinite(n)) return '';
    return formatNumber(_dos(n), { maximumFractionDigits: 2, useGrouping: false });
}

/** Para el servidor: siempre con punto («0.5 unidad de huevo»), que es lo que `_parse_quantity` entiende. */
export function cantidadParaServidor(q) {
    const n = Number(q);
    return Number.isFinite(n) ? String(_dos(n)) : '0';
}

/**
 * La unidad del escáner con el número que la acompaña, en español («2 tazas», «1 taza», «0,5 taza»): PARA PINTAR. El
 * dato (`unit`, en singular) no se toca: es el que viaja al servidor. Después se glosa (`glossUnitWord`), que ya
 * conoce las formas plurales.
 */
export function unidadParaCantidad(unidad, q) {
    const u = String(unidad || '').trim();
    const k = u.toLowerCase();
    if (!u || SIMBOLOS.has(k) || !(Number(q) > 1) || k.endsWith('s')) return u;
    if (PLURALES_ESPECIALES[k]) return PLURALES_ESPECIALES[k];
    return /[aeiouáéó]$/.test(k) ? `${u}s` : `${u}es`;
}
