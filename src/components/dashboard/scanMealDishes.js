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
    };
}

/** [P1-PLAN-LOTE-322] Lo que suman las opciones elegidas en las dudas (a porción 1×; la supuesta vale 0).
 *  [P1-PLAN-LOTE-362] Menos las que ya cambiaron la CANTIDAD de un ingrediente con desglose: esas macros salen del
 *  ingrediente, y sumar además el ajuste las contaría dos veces. */
function ajusteDeRespuestas(plato) {
    const out = _cero();
    (plato.dudas || []).forEach((d, i) => {
        if (plato.desglose && plato.aplicadas?.[i] === 'cantidad') return;
        const o = d.opciones?.[plato.respuestas?.[i]];
        if (o) for (const k of MACROS) out[k] += Number(o.ajuste?.[k]) || 0;
    });
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

/** El ingrediente de la duda: el que se llama como `sobre`, o el ÚNICO que lo contiene (o está contenido en él). */
function _componenteDeLaDuda(plato, d) {
    const sobre = _normNombre(d?.sobre);
    if (!sobre) return null;
    const nombreDe = (c) => _normNombre(c.nombreOriginal || c.name);
    const exactos = plato.componentes.filter((c) => nombreDe(c) === sobre);
    if (exactos.length === 1) return exactos[0];
    const parecidos = plato.componentes.filter((c) => nombreDe(c).includes(sobre) || sobre.includes(nombreDe(c)));
    return parecidos.length === 1 ? parecidos[0] : null;
}

/** Lleva la opción elegida de la duda `i` al ingrediente: con número, su cantidad (nueva base del ingrediente, así la
 *  porción la sigue escalando); sin número, su nombre (la supuesta devuelve el original). */
function _reflejarEnIngredientes(plato, i) {
    const d = plato.dudas?.[i];
    const o = d?.opciones?.[plato.respuestas?.[i]];
    const c = o && _componenteDeLaDuda(plato, d);
    if (!c) return plato;
    const n = numeroDeRespuesta(o.texto);
    let nuevo;
    let aplicada;
    if (n) {
        const f = c.q0 > 0 ? n / c.q0 : 1;
        nuevo = {
            ...c,
            q0: n,
            qty: redondearCantidad(n * (plato.porcion || 1), c.unit),
            checked: true,
            macros: c.macros ? MACROS.reduce((acc, k) => ({ ...acc, [k]: c.macros[k] * f }), {}) : c.macros,
        };
        aplicada = 'cantidad';
    } else {
        const original = c.nombreOriginal || c.name;
        const displayOriginal = c.nombreOriginal ? c.displayOriginal : c.display;
        nuevo = o.supuesta
            ? { ...c, name: original, display: displayOriginal || '', nombreOriginal: undefined, displayOriginal: undefined }
            : { ...c, name: o.texto, display: o.texto, nombreOriginal: original, displayOriginal: displayOriginal || '' };
        aplicada = 'nombre';
    }
    return {
        ...plato,
        componentes: plato.componentes.map((x) => (x.key === c.key ? nuevo : x)),
        aplicadas: { ...(plato.aplicadas || {}), [i]: aplicada },
    };
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
export function conRespuestaEscrita(plato, iDuda, texto, ajuste, nombrePlato = '') {
    const d = plato.dudas?.[iDuda];
    const limpio = String(texto || '').trim().slice(0, 40);
    if (!d || !limpio) return plato;
    const MAC = ['calories', 'protein', 'carbs', 'healthy_fats'];
    const op = {
        texto: limpio, supuesta: false, escrita: true,
        ajuste: MAC.reduce((acc, k) => ({ ...acc, [k]: Number(ajuste?.[k]) || 0 }), {}),
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
        nombre: o.nombre_plato || plato.nombre,
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
