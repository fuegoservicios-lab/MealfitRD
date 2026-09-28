// [P1-PLAN-LOTE-224 · 2026-09-24] La cuenta de cada plato del escáner de comida, sin React: lo que precarga la foto,
// lo que el usuario corrige y lo que viaja al servidor. Pura para poder probarla sin montar la hoja.
//
// Un plato es { base, componentes, desglose, porcion, ajuste, nombre }:
//   · `base`: los totales que estimó la IA para la foto.
//   · `componentes`: lo que la IA vio en el plato, cada uno con su cantidad detectada (`q0`), la actual (`qty`), si
//     va marcado y —cuando el servidor la manda— la parte de las macros que aporta en `q0` (`macros`).
//   · `desglose`: todos los componentes traen su parte. Entonces las macros del plato SALEN de los componentes:
//     desmarcar las albóndigas o bajar de 2 a 1 taza mueve las calorías, que es lo que la gente espera y lo que no
//     pasaba (un tester desmarcó las albóndigas y el total siguió igual). Sin desglose (un servidor anterior, un plato
//     que la IA no supo repartir), manda el total de la foto por la porción, como siempre.
//   · `porcion`: el último preset tocado (½×, 1×, 1½×, 2×). Reescala las cantidades desde lo detectado.
//   · `ajuste`: lo que el usuario corrigió A MANO en cada macro, guardado como DIFERENCIA con lo derivado. Así una
//     corrección («eran 700, no 750») sobrevive a desmarcar un componente después (700 − el componente), en vez de
//     congelar el número o de perderse.
import { clampMacro } from './mealLogShared';
import { redondearCantidad, cantidadParaServidor } from '../../utils/cantidadIngrediente';
import { normalizarDudas } from '../../utils/dudasDeLaFoto';

export const MACROS = ['calories', 'protein', 'carbs', 'healthy_fats'];
// Los presets de porción. 1½× es nuevo: «repetí, pero menos» era imposible sin editar las cuatro macros a mano.
export const PORCIONES = [0.5, 1, 1.5, 2];
// Como el chat (`CHAT_IMAGE_MAX_COUNT`): hasta 4 fotos por registro, una por plato.
export const MAX_PLATOS = 4;

const _cero = () => ({ calories: 0, protein: 0, carbs: 0, healthy_fats: 0 });
const _noNegativo = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Los campos de un plato listo a partir de la respuesta de `POST /api/diary/upload`. */
export function platoDesdeAnalisis(data, nombrePorDefecto = '') {
    const m = (data && data.macros) || {};
    const base = MACROS.reduce((acc, k) => ({ ...acc, [k]: clampMacro(k, m[k] || 0) }), {});
    const componentes = (Array.isArray(data?.items) ? data.items : [])
        .filter((it) => it && it.name)
        .slice(0, 30)
        .map((it, i) => {
            const q0 = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
            const macros = it.macros && typeof it.macros === 'object'
                ? MACROS.reduce((acc, k) => ({ ...acc, [k]: _noNegativo(it.macros[k]) }), {})
                : null;
            return {
                key: String(i),
                name: String(it.name).slice(0, 60),
                // [P1-PLAN-LOTE-225] El nombre traducido que manda el servidor PARA LEER; `name` sigue siendo el que se
                // guarda (identificador de la Nevera). Sin él, se pinta con el léxico del catálogo o en español.
                display: typeof it.display_name === 'string' && it.display_name.trim() ? it.display_name.trim().slice(0, 60) : '',
                unit: String(it.unit || 'unidad').slice(0, 20),
                q0,
                qty: q0,
                checked: true,
                macros,
            };
        });
    const desglose = componentes.length > 0
        && componentes.every((c) => c.macros)
        && componentes.some((c) => c.macros.calories > 0);
    // [P1-PLAN-LOTE-322] Las dudas traen opciones de un toque; la que supuso la IA sale ya elegida (ajuste 0).
    const dudas = normalizarDudas(data?.dudas);
    const respuestas = {};
    dudas.forEach((d, i) => {
        const j = d.opciones.findIndex((o) => o.supuesta);
        if (j >= 0) respuestas[i] = j;
    });
    return {
        nombre: String(data?.meal_name || '').slice(0, 200) || nombrePorDefecto,
        base,
        componentes: desglose ? componentes : componentes.map((c) => ({ ...c, macros: null })),
        desglose,
        porcion: 1,
        ajuste: _cero(),
        // [P1-PLAN-LOTE-305] lo que la foto no deja saber (el análisis lo declara; máx. 2)
        dudas,
        respuestas,
        confirmadas: {},
        // [P1-PLAN-LOTE-578] Lo que dijo la IA, intacto: al registrar se compara con lo que quedó (panel de
        // administración). Sobrevive a todas las correcciones porque cada `con*` conserva las claves del plato.
        ia: { nombre: String(data?.meal_name || '').slice(0, 200), componentes: componentes.length, kcal: Math.round(base.calories) },
    };
}

/** [P1-PLAN-LOTE-322] Lo que suman las opciones elegidas en las dudas (a porción 1×; la supuesta vale 0).
 *  [P1-PLAN-LOTE-362] Menos las que ya cambiaron la CANTIDAD de un ingrediente con desglose: esas macros salen del
 *  ingrediente, y sumar además el ajuste las contaría dos veces. */
function ajusteDeRespuestas(plato) {
    const out = _cero();
    (plato.dudas || []).forEach((d, i) => {
        if (plato.desglose && plato.aplicadas?.[i] === 'cantidad') {
            // [P1-PLAN-LOTE-363] lo dicho que no cabe en «N unidades» («con 3 yemas») sí se suma
            const x = plato.detalles?.[i];
            if (x) for (const k of MACROS) out[k] += Number(x[k]) || 0;
            return;
        }
        const o = d.opciones?.[plato.respuestas?.[i]];
        if (o) for (const k of MACROS) out[k] += Number(o.ajuste?.[k]) || 0;
    });
    // [P1-PLAN-LOTE-365] sin desglose, un ingrediente cambiado mueve el plato por su diferencia (nuevo − anterior)
    if (!plato.desglose) {
        for (const d of Object.values(plato.cambios || {})) for (const k of MACROS) out[k] += Number(d?.[k]) || 0;
    }
    return out;
}

// ── [P1-PLAN-LOTE-362 · 2026-09-26] La respuesta de una duda también cambia el INGREDIENTE ─────────────────────────
// El dueño: «✓ 4 huevos» arriba y «Huevo revuelto · 2 unidades» abajo. La lista de ingredientes es lo que se ve, lo que
// se guarda y lo que baja de la Nevera: tiene que decir lo mismo que la respuesta.

const _normNombre = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const _FRACCIONES = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** El número al principio de una respuesta («4 huevos», «1½ taza», «0,5 lasca», «1/2 taza»); null si no empieza por uno. */
export function numeroDeRespuesta(texto) {
    const t = String(texto || '').trim();
    const redondo = (n) => (n > 0 ? Math.round(n * 100) / 100 : null);
    // «1 1/2 tazas»
    let m = t.match(/^(\d+)\s+(\d+)\/(\d+)/);
    if (m && Number(m[3]) > 0) return redondo(Number(m[1]) + Number(m[2]) / Number(m[3]));
    // «1/2 taza»
    m = t.match(/^(\d+)\/(\d+)/);
    if (m && Number(m[2]) > 0) return redondo(Number(m[1]) / Number(m[2]));
    // «3 huevos», «2,5 onzas», «½ taza», «1½ lascas»
    m = t.match(/^(\d+(?:[.,]\d+)?)?\s*([½¼¾⅓⅔])?/);
    if (!m || (!m[1] && !m[2])) return null;
    return redondo((m[1] ? Number(m[1].replace(',', '.')) : 0) + (m[2] ? _FRACCIONES[m[2]] : 0));
}

/** [P1-PLAN-LOTE-363] ¿La respuesta es solo «número [palabra]» («4», «4 huevos», «½ taza»)? Si dice más («4 huevos
 *  con 3 yemas»), ese detalle se ve junto al ingrediente y su efecto se suma aparte. */
const _esRespuestaSimple = (texto) => /^[\d\s.,/½¼¾⅓⅔]*[\p{L}]*\s*$/u.test(String(texto || '').trim());

/** El ingrediente de la duda: el que se llama como `sobre`, o el ÚNICO que lo contiene (o está contenido en él). */
function _componenteDeLaDuda(plato, d) {
    const sobre = _normNombre(d?.sobre);
    if (!sobre) return null;
    // [P1-PLAN-LOTE-369] también por el nombre de antes de «Cambiar» (365): si no, la duda perdía su ingrediente
    const nombresDe = (c) => [c.nombreOriginal, c.antesDelCambio?.name, c.name].filter(Boolean).map(_normNombre);
    const exactos = plato.componentes.filter((c) => nombresDe(c).includes(sobre));
    if (exactos.length === 1) return exactos[0];
    const parecidos = plato.componentes.filter((c) => nombresDe(c).some((n) => n.includes(sobre) || sobre.includes(n)));
    return parecidos.length === 1 ? parecidos[0] : null;
}

// ── [P1-PLAN-LOTE-369 · 2026-09-26] La respuesta toca el ingrediente solo cuando habla de él ──────────────────────
const _singular = (w) => w.replace(/(es|s)$/, '');
const _ALIAS_UNIDAD = { gramo: 'g', gr: 'g', onza: 'oz', mililitro: 'ml', cucharada: 'cda', cucharadita: 'cdta' };
const _unidadCanonica = (w) => { const s = _singular(_normNombre(w)); return _ALIAS_UNIDAD[s] || s; };
const _CONTABLES = new Set(['unidad', 'pieza', '']);

/** La cantidad que dice la respuesta EN LA UNIDAD DEL INGREDIENTE, o null si habla en otra («1 taza» de un arroz
 *  en gramos) o no dice ninguna. La `cantidad` del servidor (363) ya viene en esa unidad. */
function _cantidadEnSuUnidad(o, c) {
    if (Number(o?.cantidad) > 0) return Number(o.cantidad);
    const n = numeroDeRespuesta(o?.texto);
    if (!n) return null;
    const palabra = _normNombre(String(o.texto).replace(/^[\d\s.,/½¼¾⅓⅔]+/, '')).split(/\s+/)[0] || '';
    if (!palabra) return n;                                   // «4»
    const unidad = _unidadCanonica(c.unit);
    if (_unidadCanonica(palabra) === unidad) return n;        // «2 tazas» con taza, «30 gramos» con g
    if (_CONTABLES.has(unidad)) {                             // «4 huevos» con «Huevo revuelto · unidad»
        const nombres = [c.nombreOriginal, c.antesDelCambio?.name, c.name].filter(Boolean)
            .flatMap((x) => _normNombre(x).split(/\s+/)).map(_singular);
        if (nombres.includes(_singular(palabra)) || _CONTABLES.has(_unidadCanonica(palabra))) return n;
    }
    return null;
}

/** ¿Las opciones de la duda NOMBRAN el ingrediente? Sí cuando la supuesta es su nombre («Panecillo» / «Arepitas de
 *  maíz»); no cuando describen otra cosa de él («Frito» / «A la plancha» del pollo). */
function _opcionesNombranElIngrediente(d, c) {
    const supuesta = d?.opciones?.find((x) => x.supuesta);
    const original = c.nombreOriginal || c.name;
    return !!supuesta && _normNombre(supuesta.texto) === _normNombre(original);
}

/** El ingrediente sin lo que le hizo una respuesta anterior de la duda `i` (cantidad o nombre). */
function _sinLoQueHizoLaDuda(c, aplicada) {
    if (aplicada === 'cantidad' && c.q0Foto != null) {
        const f = c.q0 > 0 ? c.q0Foto / c.q0 : 1;
        const base = 'displaySinNota' in c ? c.displaySinNota : c.display;
        const { displaySinNota: _d, ...resto } = c;
        return {
            ...resto,
            q0: c.q0Foto,
            qty: c.q0Foto,
            macros: c.macros ? MACROS.reduce((acc, k) => ({ ...acc, [k]: c.macros[k] * f }), {}) : c.macros,
            display: base,
        };
    }
    if (aplicada === 'nombre' && c.nombreOriginal) {
        return { ...c, name: c.nombreOriginal, display: c.displayOriginal || '', nombreOriginal: undefined, displayOriginal: undefined };
    }
    return c;
}

/** Lleva la opción elegida de la duda `i` al ingrediente: con número, su cantidad (nueva base del ingrediente, así la
 *  porción la sigue escalando); sin número, su nombre (la supuesta devuelve el original). */
function _reflejarEnIngredientes(plato, i) {
    const d = plato.dudas?.[i];
    const o = d?.opciones?.[plato.respuestas?.[i]];
    const c = o && _componenteDeLaDuda(plato, d);
    if (!c) return plato;
    // [P1-PLAN-LOTE-363] la cantidad que dijo el servidor gana al número del texto («tres huevos» → 3)
    // [P1-PLAN-LOTE-369] …y el número solo cuenta si habla en la unidad del ingrediente
    const n = _cantidadEnSuUnidad(o, c);
    const detalles = { ...(plato.detalles || {}) };
    delete detalles[i];
    const aplicadas = { ...(plato.aplicadas || {}) };
    let nuevo;
    let aplicada;
    if (n) {
        const f = c.q0 > 0 ? n / c.q0 : 1;
        const macros = c.macros ? MACROS.reduce((acc, k) => ({ ...acc, [k]: c.macros[k] * f }), {}) : c.macros;
        // [P1-PLAN-LOTE-363] el ingrediente como vino de la foto (la supuesta): contra él se mide lo que queda del ajuste
        const q0Foto = c.q0Foto ?? c.q0;
        const macrosFoto = c.macrosFoto ?? c.macros;
        const displayBase = 'displaySinNota' in c ? c.displaySinNota : c.display;
        const conNota = o.escrita && !_esRespuestaSimple(o.texto);
        nuevo = {
            ...c,
            q0: n,
            qty: redondearCantidad(n * (plato.porcion || 1), c.unit),
            checked: true,
            macros,
            q0Foto,
            macrosFoto,
            display: conNota ? `${displayBase || c.name} (${o.texto})` : displayBase,
            displaySinNota: conNota ? displayBase : undefined,
        };
        if (conNota && macros && macrosFoto) {
            detalles[i] = MACROS.reduce((acc, k) => ({
                ...acc, [k]: (Number(o.ajuste?.[k]) || 0) - (macros[k] - macrosFoto[k]),
            }), {});
        }
        if (!('displaySinNota' in nuevo) || nuevo.displaySinNota === undefined) delete nuevo.displaySinNota;
        aplicada = 'cantidad';
    } else if (numeroDeRespuesta(o.texto) || !_opcionesNombranElIngrediente(d, c)) {
        // [P1-PLAN-LOTE-369] no habla del ingrediente («A la plancha», «1 taza» de un arroz en gramos): manda el
        // ajuste, y lo que una respuesta anterior de esta duda le hizo al ingrediente se deshace
        nuevo = _sinLoQueHizoLaDuda(c, aplicadas[i]);
        aplicada = undefined;
    } else {
        const original = c.nombreOriginal || c.name;
        const displayOriginal = c.nombreOriginal ? c.displayOriginal : c.display;
        nuevo = o.supuesta
            ? { ...c, name: original, display: displayOriginal || '', nombreOriginal: undefined, displayOriginal: undefined }
            // [P1-PLAN-LOTE-626] el nombre (identificador) en español; lo que se lee, en el idioma del usuario
            : { ...c, name: o.texto, display: o.texto_mostrar || o.texto, nombreOriginal: original, displayOriginal: displayOriginal || '' };
        aplicada = 'nombre';
    }
    if (aplicada) aplicadas[i] = aplicada; else delete aplicadas[i];
    return {
        ...plato,
        componentes: plato.componentes.map((x) => (x.key === c.key ? nuevo : x)),
        aplicadas,
        detalles,
    };
}

/** [P1-PLAN-LOTE-363] El ingrediente de la duda `i` para el servidor (nombre, cantidad, unidad), o null. */
export function ingredienteDeLaDuda(plato, i) {
    const c = _componenteDeLaDuda(plato, plato.dudas?.[i]);
    if (!c) return null;
    return { nombre: c.nombreOriginal || c.name, cantidad: Number(c.q0Foto ?? c.q0) || 0, unidad: c.unit || '' };
}

/** Lo derivado, sin redondear: la suma de los componentes marcados (con desglose) o el total de la foto × porción,
 *  más lo que cambian las opciones elegidas en las dudas (escaladas por la porción). */
export function macrosDerivadas(plato) {
    const extra = ajusteDeRespuestas(plato);
    const f = plato.porcion || 1;
    if (plato.desglose) {
        const out = _cero();
        for (const c of plato.componentes) {
            if (!c.checked || !(c.qty > 0) || !(c.q0 > 0) || !c.macros) continue;
            const r = c.qty / c.q0;
            for (const k of MACROS) out[k] += c.macros[k] * r;
        }
        for (const k of MACROS) out[k] += extra[k] * f;
        return out;
    }
    return MACROS.reduce((acc, k) => ({ ...acc, [k]: ((plato.base?.[k] || 0) + extra[k]) * f }), {});
}

/** [P1-PLAN-LOTE-361 · 2026-09-26] «Otra…»: lo escrito entra como UNA opción más de esa duda (su ajuste lo calculó el
 *  servidor por texto), elegida y confirmada. Escribir otra vez REEMPLAZA la escrita anterior; las demás dudas no se
 *  tocan (antes se re-analizaba la foto entera y se perdían). */
export function conRespuestaEscrita(plato, iDuda, texto, ajuste, nombrePlato = '', cantidad = null) {
    const d = plato.dudas?.[iDuda];
    const limpio = String(texto || '').trim().slice(0, 60);   // [P1-PLAN-LOTE-382] 40 cortaba sin avisar
    if (!d || !limpio) return plato;
    const MAC = ['calories', 'protein', 'carbs', 'healthy_fats'];
    const op = {
        texto: limpio, supuesta: false, escrita: true,
        ajuste: MAC.reduce((acc, k) => ({ ...acc, [k]: Number(ajuste?.[k]) || 0 }), {}),
        ...(Number(cantidad) > 0 ? { cantidad: Number(cantidad) } : {}),   // [P1-PLAN-LOTE-363]
    };
    const opciones = [...d.opciones.filter((o) => !o.escrita), op];
    const dudas = plato.dudas.map((x, i) => (i === iDuda ? { ...x, opciones } : x));
    const escrito = {
        ...plato,
        dudas,
        nombre: String(nombrePlato || '').trim() || plato.nombre,
        respuestas: { ...(plato.respuestas || {}), [iDuda]: opciones.length - 1 },
        confirmadas: { ...(plato.confirmadas || {}), [iDuda]: true },
    };
    return _reflejarEnIngredientes(escrito, iDuda);   // [P1-PLAN-LOTE-362]
}

/** [P1-PLAN-LOTE-322] Tocar una opción de una duda: la elige (las macros la reflejan al instante), la da por
 *  confirmada y, si cambia qué es el plato («Arepa»), cambia el nombre. */
export function conRespuesta(plato, iDuda, iOpcion) {
    const o = plato.dudas?.[iDuda]?.opciones?.[iOpcion];
    if (!o) return plato;
    return _reflejarEnIngredientes({   // [P1-PLAN-LOTE-362] la lista de ingredientes dice lo mismo que la respuesta
        ...plato,
        nombre: o.nombre_plato_mostrar || o.nombre_plato || plato.nombre,   // [P1-PLAN-LOTE-626]
        respuestas: { ...(plato.respuestas || {}), [iDuda]: iOpcion },
        confirmadas: { ...(plato.confirmadas || {}), [iDuda]: true },
    }, iDuda);
}

/** Lo que se pinta y se guarda: lo derivado más lo corregido a mano, con los topes del servidor (enteros). */
export function macrosDelPlato(plato) {
    const d = macrosDerivadas(plato);
    return MACROS.reduce((acc, k) => ({ ...acc, [k]: clampMacro(k, d[k] + (plato.ajuste?.[k] || 0)) }), {});
}

/** Las calorías de un componente en su cantidad actual (con desglose; si no, `null`). */
export function kcalDelComponente(c) {
    if (!c || !c.macros || !(c.q0 > 0)) return null;
    return Math.round(c.macros.calories * ((Number(c.qty) || 0) / c.q0));
}

/** Una macro tecleada: se guarda como diferencia con lo derivado (ver cabecera). */
export function conMacroTecleada(plato, k, raw) {
    const v = clampMacro(k, raw);
    return { ...plato, ajuste: { ...plato.ajuste, [k]: v - macrosDerivadas(plato)[k] } };
}

/** Un preset de porción: reescala TODAS las cantidades desde lo detectado y descarta lo corregido a mano en las
 * macros (el preset rellena, como siempre hizo). Sin desglose, las cantidades se reescalan igual: lo que se descuenta
 * de la Nevera tiene que ser lo que se comió. */
export function conPorcion(plato, m) {
    return {
        ...plato,
        porcion: m,
        ajuste: _cero(),
        componentes: plato.componentes.map((c) => ({ ...c, qty: redondearCantidad(c.q0 * m, c.unit) })),
    };
}

// ── [P1-PLAN-LOTE-365 · 2026-09-26] Corregir lo que la foto creyó ver ───────────────────────────────────────────
// El dueño: «el queso no lo pude cambiar y nombrar su marca, mozzarella» y «no puedo decir que es una simple batida
// de lechosa con leche». Un ingrediente se cambia por su nombre (el servidor da sus macros); el plato entero, por su
// descripción (el mismo cálculo de «Descríbelo y lo calculo»).

/** ¿El texto es el nombre que el ingrediente tenía antes de cambiarlo (sin mayúsculas, acentos ni espacios)? */
export function esNombreOriginal(c, texto) {
    const original = c?.antesDelCambio ? c.antesDelCambio.name : c?.name;
    return _normNombre(texto) !== '' && _normNombre(texto) === _normNombre(original);
}

/** Cambia el ingrediente `key` por `nombre`. `macros` y `anteriores` son las del nuevo y del anterior en la cantidad
 *  ACTUAL (`qty`), como las devuelve `/api/diary/scan/ingrediente`. Con desglose, la fila toma las nuevas (repartidas
 *  a su cantidad detectada `q0`, que es la escala de `macros`); sin desglose, el plato guarda la diferencia por
 *  porción 1×. El nombre original lo devuelve a como estaba, sin preguntar al servidor. */
export function conIngredienteCambiado(plato, key, nombre, macros, anteriores, cantidadCalculada = null) {
    const c = plato.componentes.find((x) => x.key === key);
    const limpio = String(nombre || '').trim().slice(0, 60);
    if (!c || !limpio) return plato;
    const cambios = { ...(plato.cambios || {}) };
    delete cambios[key];
    let nuevo;
    if (esNombreOriginal(c, limpio)) {
        if (!c.antesDelCambio) return plato;
        const { antesDelCambio, ...resto } = c;
        nuevo = { ...resto, name: antesDelCambio.name, display: antesDelCambio.display, macros: antesDelCambio.macros };
    } else {
        const antesDelCambio = c.antesDelCambio || { name: c.name, display: c.display, macros: c.macros };
        // [P1-PLAN-LOTE-380] las macros son de la cantidad CON LA QUE SE CALCULÓ (el usuario pudo moverla mientras)
        const qty = Number(cantidadCalculada) > 0 ? Number(cantidadCalculada) : (Number(c.qty) > 0 ? Number(c.qty) : c.q0);
        const aQ0 = qty > 0 ? c.q0 / qty : 1;
        nuevo = { ...c, name: limpio, display: '', antesDelCambio, checked: true };
        if (plato.desglose) {
            nuevo.macros = MACROS.reduce((acc, k) => ({ ...acc, [k]: _noNegativo(macros?.[k]) * aQ0 }), {});
        } else {
            // diferencia por porción 1× (la cantidad detectada `q0`): la porción la vuelve a escalar
            cambios[key] = MACROS.reduce((acc, k) => ({
                ...acc, [k]: ((Number(macros?.[k]) || 0) - (Number(anteriores?.[k]) || 0)) * aQ0,
            }), {});
        }
    }
    return { ...plato, cambios, componentes: plato.componentes.map((x) => (x.key === key ? nuevo : x)) };
}

/** «¿No es esto? Descríbelo»: el plato rehecho con la respuesta de `/api/diary/consumed/estimate-plate` (348).
 *  Nombre, ingredientes (en gramos si los trae; si no, 1 porción) y macros salen de ahí; las dudas de la foto se van
 *  (eran sobre lo que la IA creyó ver). Lo demás del plato (id, foto, estado) se conserva. Sin líneas, no cambia. */
export function platoDesdeDescripcion(plato, data) {
    const lineas = (Array.isArray(data?.lineas) ? data.lineas : []).filter((l) => l && l.name);
    if (!lineas.length) return plato;
    const componentes = lineas.slice(0, 30).map((l, i) => {
        const gramos = Number(l.grams) > 0 ? Number(l.grams) : 0;
        const m = l.macros || {};
        return {
            key: `d${i}`,
            name: String(l.name).slice(0, 60),
            display: '',
            unit: gramos ? 'g' : 'porción',
            q0: gramos || 1,
            qty: gramos || 1,
            checked: true,
            macros: {
                calories: _noNegativo(m.kcal), protein: _noNegativo(m.protein),
                carbs: _noNegativo(m.carbs), healthy_fats: _noNegativo(m.fats),
            },
        };
    });
    const base = componentes.reduce((acc, c) => MACROS.reduce((a, k) => ({ ...a, [k]: a[k] + c.macros[k] }), acc), _cero());
    return {
        ...plato,
        nombre: String(data?.name || '').trim().slice(0, 200) || plato.nombre,
        base: MACROS.reduce((acc, k) => ({ ...acc, [k]: clampMacro(k, base[k]) }), {}),
        componentes,
        desglose: true,
        porcion: 1,
        ajuste: _cero(),
        dudas: [],
        respuestas: {},
        confirmadas: {},
        aplicadas: {},
        detalles: {},
        cambios: {},
        // [P1-PLAN-LOTE-578] «Descríbelo» reemplaza todo lo de la foto: queda dicho para el panel.
        redescrito: true,
    };
}

// ── [P1-PLAN-LOTE-366 · 2026-09-26] Cada plato, su comida y su día ──────────────────────────────────────────────
// El dueño: «si subo dos fotos, ¿puedo dividir sus horarios y para qué día va cada plato?». Un plato sin `destino`
// sigue lo elegido abajo para todo el registro; con `destino`, va a su propia comida y su propio día.

/** A qué comida y día va el plato: el suyo si lo marcó aparte (`propio`), si no el común. */
export function destinoDelPlato(plato, mealType, daysAgo) {
    const d = plato?.destino;
    return d ? { mealType: d.mealType, daysAgo: d.daysAgo, propio: true } : { mealType, daysAgo, propio: false };
}

/** Marca (o, con `null`, quita) la comida y el día propios del plato. */
export function conDestinoPropio(plato, destino) {
    if (!destino) {
        const { destino: _quitado, ...resto } = plato;
        return resto;
    }
    return { ...plato, destino: { mealType: destino.mealType, daysAgo: destino.daysAgo } };
}

export function conCantidad(plato, key, qty) {
    return { ...plato, componentes: plato.componentes.map((c) => (c.key === key ? { ...c, qty } : c)) };
}

export function conComponenteAlternado(plato, key) {
    return { ...plato, componentes: plato.componentes.map((c) => (c.key === key ? { ...c, checked: !c.checked } : c)) };
}

/** Lo que viaja en `ingredients`: solo lo marcado y con cantidad, en el formato que `_parse_quantity` entiende
 * («2 unidad de huevo»; con punto decimal: «0.5 taza de habichuelas»). */
export function ingredientesParaGuardar(plato) {
    return plato.componentes
        .filter((c) => c.checked && c.name && Number(c.qty) > 0)
        .map((c) => `${cantidadParaServidor(c.qty)} ${c.unit} de ${c.name}`);
}

/**
 * Los nombres con los que se registran varios platos a la vez. El servidor toma dos filas iguales (mismo nombre y tipo
 * de comida en 60 s) por un doble toque y descarta la segunda (P2-CONSUMED-DEDUP): dos jugos iguales en el mismo
 * registro se numeran («Jugo de chinola (2)») para que lleguen los dos.
 */
export function nombresSinRepetir(nombres) {
    const vistos = new Map();
    return nombres.map((n) => {
        const base = String(n || '').trim();
        const k = base.toLowerCase();
        const veces = (vistos.get(k) || 0) + 1;
        vistos.set(k, veces);
        return veces === 1 ? base : `${base.slice(0, 194)} (${veces})`;
    });
}

/** La suma de varios platos (para el pie de la hoja). */
export function totalesDe(platos) {
    return platos.reduce((acc, p) => {
        const m = macrosDelPlato(p);
        for (const k of MACROS) acc[k] += m[k];
        return acc;
    }, _cero());
}

/** [P1-PLAN-LOTE-578 · 2026-09-27] Cuánto corrigió el usuario lo que dijo la IA, en CONTEOS (sin texto): viaja como
 * `scan_meta` al registrar y alimenta el panel de administración. `null` si el plato no nació de un análisis. */
export function resumenDeCorrecciones(plato) {
    const ia = plato?.ia;
    if (!ia) return null;
    const comps = Array.isArray(plato.componentes) ? plato.componentes : [];
    const redescrito = plato.redescrito === true;
    const porcion = Number(plato.porcion) || 1;
    const dudas = Array.isArray(plato.dudas) ? plato.dudas : [];
    // Editada = distinta de lo detectado tanto CRUDO como redondeado: `qty` nace como `q0` sin redondear y un preset de
    // porción la redondea, así que ninguna de las dos formas cuenta como mano del usuario (revisión final).
    const editada = (c) => {
        const esperada = c.q0 * porcion;
        const q = Number(c.qty);
        return Math.abs(q - esperada) > 1e-6 && q !== redondearCantidad(esperada, c.unit);
    };
    return {
        componentes: ia.componentes,
        cambiados: redescrito ? 0 : comps.filter((c) => c.antesDelCambio).length,
        cantidades_editadas: redescrito ? 0 : comps.filter((c) => c.checked && editada(c)).length,
        desmarcados: comps.filter((c) => !c.checked).length,
        porcion,
        dudas: dudas.length,
        dudas_cambiadas: dudas.filter((d, i) => {
            const j = plato.respuestas?.[i];
            return plato.confirmadas?.[i] && Number.isInteger(j) && !d.opciones?.[j]?.supuesta;
        }).length,
        redescrito,
        nombre_editado: !!ia.nombre && String(plato.nombre || '') !== ia.nombre,
        macros_tecleadas: MACROS.some((k) => Math.abs(Number(plato.ajuste?.[k]) || 0) >= 0.5),
        kcal_ia: ia.kcal,
        kcal_final: Math.round(macrosDelPlato(plato).calories),
    };
}
