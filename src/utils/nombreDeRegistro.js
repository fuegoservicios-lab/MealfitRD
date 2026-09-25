// [P1-PLAN-LOTE-225 · 2026-09-24] El nombre de una comida del DIARIO, para leerlo en el idioma del usuario.
//
// El diario guarda el nombre tal como nació, y casi siempre nació en español: «Me lo comí» guarda el nombre canónico
// del plato del plan, el componedor sin nombre escrito guarda los alimentos del catálogo («Pollo, Arroz y
// Habichuelas») y el respaldo del servidor es «Comida registrada». Ese dato no se toca (el coach y los recálculos lo
// leen así); lo que cambia es lo que se PINTA:
//
//   1. un plato del plan → su nombre traducido (`_display`, vía `mealDisplayName`);
//   2. una frase fija del servidor → su traducción (`textoDelServidor`);
//   3. alimentos del catálogo, solos o en lista → cada uno por el léxico, unidos como se une en ese idioma.
//
// Lo escrito por el usuario (y lo que el escáner ya nombró en su idioma) no casa con nada de eso y se pinta tal cual.
import { getLocale } from '../i18n';
import { mealDisplayName } from './displayMeal';
import { esAlimentoDelCatalogo, nombreDelAlimento } from './nombresDeAlimentos';
import { textoDelServidor } from './textosDelServidor';

let _memo = { plan: null, porNombre: null };

function _platoDelPlan(plan, nombre) {
    if (!plan || typeof plan !== 'object') return null;
    if (_memo.plan !== plan) {
        const m = new Map();
        const dias = [
            ...(Array.isArray(plan._archived_days) ? plan._archived_days : []),
            ...(Array.isArray(plan.days) ? plan.days : []),
        ];
        for (const d of dias) {
            for (const meal of (Array.isArray(d?.meals) ? d.meals : [])) {
                const n = typeof meal?.name === 'string' ? meal.name.trim() : '';
                // El más reciente gana: es el que el usuario tiene delante.
                if (n) m.set(n, meal);
            }
        }
        _memo = { plan, porNombre: m };
    }
    return _memo.porNombre.get(nombre) || null;
}

function _partes(s) {
    if (esAlimentoDelCatalogo(s)) return [s];
    const trozos = s.split(', ');
    const ultimo = trozos.pop() || '';
    const i = ultimo.lastIndexOf(' y ');
    if (i > 0) trozos.push(ultimo.slice(0, i), ultimo.slice(i + 3));
    else trozos.push(ultimo);
    return trozos.map((x) => x.trim()).filter(Boolean);
}

function _lista(items, locale) {
    if (items.length === 1) return items[0];
    try {
        return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
    } catch {
        return items.join(', ');
    }
}

/** El nombre de un registro del diario en `locale`; si no se reconoce, tal cual. */
export function nombreDeRegistro(nombre, planData, t, locale = getLocale()) {
    const s = typeof nombre === 'string' ? nombre.trim() : '';
    if (!s || !locale || locale === 'es-DO') return nombre;
    const plato = _platoDelPlan(planData, s);
    if (plato) {
        const visible = mealDisplayName(plato, locale);
        if (visible && visible !== s) return visible;
    }
    const fija = textoDelServidor(s, t, locale);
    if (fija !== s) return fija;
    const partes = _partes(s);
    if (partes.length > 1 || (partes.length === 1 && esAlimentoDelCatalogo(partes[0]))) {
        if (partes.every(esAlimentoDelCatalogo)) return _lista(partes.map((p) => nombreDelAlimento(p, locale)), locale);
    }
    return nombre;
}
