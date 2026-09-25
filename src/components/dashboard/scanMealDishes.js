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
    return {
        nombre: String(data?.meal_name || '').slice(0, 200) || nombrePorDefecto,
        base,
        componentes: desglose ? componentes : componentes.map((c) => ({ ...c, macros: null })),
        desglose,
        porcion: 1,
        ajuste: _cero(),
    };
}

/** Lo derivado, sin redondear: la suma de los componentes marcados (con desglose) o el total de la foto × porción. */
export function macrosDerivadas(plato) {
    if (plato.desglose) {
        const out = _cero();
        for (const c of plato.componentes) {
            if (!c.checked || !(c.qty > 0) || !(c.q0 > 0) || !c.macros) continue;
            const f = c.qty / c.q0;
            for (const k of MACROS) out[k] += c.macros[k] * f;
        }
        return out;
    }
    return MACROS.reduce((acc, k) => ({ ...acc, [k]: (plato.base?.[k] || 0) * (plato.porcion || 1) }), {});
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
