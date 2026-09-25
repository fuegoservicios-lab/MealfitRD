// [P1-PLAN-LOTE-222 · 2026-09-24] El nombre de un alimento del catálogo en el idioma del usuario.
//
// El catálogo tiene UN nombre por alimento, el canónico español, y es el identificador del motor: con él resuelven la
// Nevera (`pantry_names_match`), el guard de coherencia y el backstop de alergias. Eso no se toca: lo que se GUARDA y se
// ENVÍA sigue siendo `name`. Hasta este lote además sólo había un gloss inglés, así que la Nevera, el escáner y los
// buscadores hablaban español a un francés, y el buscador no encontraba «poulet».
//
// Desde el lote 222, cada fila de /api/catalog trae `names = {en-US, pt-BR, fr-FR, it-IT}` (backend
// `food_names_i18n.py`, el mismo léxico con que el backstop entiende una alergia escrita en otro idioma). Este módulo
// decide QUÉ SE PINTA y POR DÓNDE SE BUSCA. Sin traducción para un alimento (alta posterior al léxico), se pinta el
// inglés si el idioma es inglés y, si no, el español: nunca una clave ni un hueco.
import { getLocale } from '../i18n';
import { getCachedMasterList, getCachedGlossIndex } from './pantryCache';
import { glossUnitWord } from './shoppingHelpers';
import { leerCantidad, unidadParaCantidad, formatearCantidad } from './cantidadIngrediente';

const _sinAcentos = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const _texto = (v) => (typeof v === 'string' ? v.trim() : '');

/** El nombre de una FILA del catálogo en `locale` (por defecto, el activo). */
export function nombreDeFila(fila, locale = getLocale()) {
    const es = _texto(fila?.name);
    if (!locale || locale === 'es-DO') return es;
    const propio = _texto(fila?.names?.[locale]);
    if (propio) return propio;
    if (locale === 'en-US') return _texto(fila?.name_en) || es;
    return es;
}

// El catálogo en memoria, indexado por nombre sin acentos. Se reconstruye sólo si cambia el array.
let _memo = { filas: null, porNombre: null };
const _porNombre = () => {
    const filas = getCachedMasterList();
    if (!Array.isArray(filas) || !filas.length) return null;
    if (_memo.filas !== filas) {
        const m = new Map();
        for (const f of filas) {
            const k = _sinAcentos(f?.name);
            if (k && !m.has(k)) m.set(k, f);
        }
        _memo = { filas, porNombre: m };
    }
    return _memo.porNombre;
};

/**
 * El nombre que se PINTA para un alimento del que sólo se sabe el nombre canónico español («Pechuga de pollo» →
 * «Blanc de poulet» en francés). Mira primero el catálogo en memoria y después el índice que el dispositivo guarda
 * 24 h; si ninguno lo conoce (o el nombre no es del catálogo: «2 huevos», un plato), devuelve el nombre tal cual.
 */
export function nombreDelAlimento(nombreEs, locale = getLocale()) {
    const es = _texto(nombreEs);
    if (!es || !locale || locale === 'es-DO') return nombreEs;
    const k = _sinAcentos(es);
    const fila = _porNombre()?.get(k);
    if (fila) {
        const n = nombreDeFila(fila, locale);
        return n || nombreEs;
    }
    const e = getCachedGlossIndex().get(k);
    if (e && typeof e === 'object') {
        const propio = _texto(e.names?.[locale]);
        if (propio) return propio;
        if (locale === 'en-US' && _texto(e.name_en)) return _texto(e.name_en);
    } else if (typeof e === 'string' && locale === 'en-US' && e.trim()) {
        return e.trim();
    }
    return nombreEs;
}

/** ¿`nombreEs` es el nombre canónico de un alimento del catálogo (en memoria o en el índice guardado)? */
export function esAlimentoDelCatalogo(nombreEs) {
    const k = _sinAcentos(nombreEs);
    if (!k) return false;
    if (_porNombre()?.has(k)) return true;
    return getCachedGlossIndex().has(k);
}

/**
 * Todas las formas de buscar una fila: el canónico, sus alias curados y su nombre en los 4 idiomas. El usuario
 * escribe en su idioma, pero también en español (la receta y la lista del súper le enseñan esos nombres) o en inglés.
 */
export function formasDeBuscar(fila) {
    const out = [];
    const ver = new Set();
    const add = (v) => {
        const t = _texto(v);
        const k = _sinAcentos(t);
        if (t && !ver.has(k)) { ver.add(k); out.push(t); }
        // «Œuf»: quien escribe «oeuf» (teclado sin la ligadura) también tiene que encontrarlo.
        if (/[œæŒÆ]/.test(t)) add(t.replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/æ/g, 'ae').replace(/Æ/g, 'Ae'));
    };
    add(fila?.name);
    if (fila?.names && typeof fila.names === 'object') Object.values(fila.names).forEach(add);
    add(fila?.name_en);
    if (Array.isArray(fila?.aliases)) fila.aliases.forEach(add);
    return out;
}

// «2 unidad de Huevo», «150 g de pechuga de pollo»: la forma en que el motor escribe una línea de ingrediente (y la que
// devuelve el servidor en `not_in_pantry` / `failed_to_deduct` al registrar una comida).
const _LINEA = /^\s*(\d+(?:[.,]\d+)?(?:\s+\d+)?(?:\s*\/\s*\d+)?)\s+(\S+)\s+de\s+(.+?)\s*$/i;

/**
 * Una línea de ingrediente del motor, para LEERLA en el idioma del usuario: «2 unidad de Huevo» → «2 units of Egg»
 * / «2 unités de Œuf». La cantidad se respeta, la unidad pasa por su plural y su traducción y el
 * alimento por el léxico. En español, o si la línea no tiene esa forma, se devuelve tal cual (o sólo el alimento
 * traducido). Es para PINTAR: la línea que viaja al servidor no se toca.
 */
export function lineaDeIngredienteVisible(linea, t, locale = getLocale()) {
    const s = _texto(linea);
    if (!s || !locale || locale === 'es-DO' || typeof t !== 'function') return linea;
    const m = _LINEA.exec(s);
    if (!m) return nombreDelAlimento(s, locale);
    const [, cantidadTexto, unidad, nombre] = m;
    const q = leerCantidad(cantidadTexto);
    return t('{cantidad} {unidad} de {alimento}', {
        cantidad: q === null ? cantidadTexto : formatearCantidad(q),
        unidad: glossUnitWord(q === null ? unidad : unidadParaCantidad(unidad, q), t),
        alimento: nombreDelAlimento(nombre, locale),
    });
}
