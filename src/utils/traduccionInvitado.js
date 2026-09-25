// [P1-PLAN-LOTE-224 · 2026-09-24] El plan del INVITADO en su idioma.
//
// Las cuentas reciben la traducción del plan (`_display[locale]`) desde el servidor: se escribe en la base de datos
// después de generar, de cambiar un plato o de cambiar de idioma. El invitado —el embudo del plan gratis— no tiene
// plan en la base de datos, así que nada de eso lo alcanzaba: con la app en inglés, platos, descripciones y recetas
// salían en español justo en la primera impresión. Ahora el cliente manda su copia a `POST /api/plans/guest-display`
// y FUSIONA lo que vuelve. Este módulo decide qué falta, no repite la petición y fusiona sin pisar un plato que cambió.
//
// Una entrada `_provisional` (sólo el nombre de un plato recién cambiado, ver AssessmentContext) cuenta como que
// FALTA: es un anticipo, no la traducción.
//
// El contexto del plan lo carga con `import()` (vive en el arranque de la app y esto sólo le hace falta al invitado
// fuera del español), así que la petición y su estado también viven aquí y no en el contexto.
import { fetchWithAuth } from '../config/api';
import { getLocale } from '../i18n';
import { safeLocalStorageSet } from './safeLocalStorage';

const _entrada = (m, locale) => (m && typeof m._display === 'object' && m._display ? m._display[locale] : null);

/** ¿Algún plato del plan sigue sin su traducción a `locale`? */
export function faltaTraduccion(plan, locale) {
    if (!plan || !locale || locale === 'es-DO') return false;
    const days = Array.isArray(plan.days) ? plan.days : [];
    return days.some((d) => (Array.isArray(d?.meals) ? d.meals : []).some((m) => {
        if (!m || typeof m !== 'object') return false;
        const e = _entrada(m, locale);
        return !e || e._provisional === true || typeof e.name !== 'string' || !e.name.trim();
    }));
}

/** La huella de lo que se pediría: el idioma y los platos. Misma huella ⇒ no se repite la petición. */
export function firmaDeTraduccion(plan, locale) {
    const days = Array.isArray(plan?.days) ? plan.days : [];
    return `${locale}|${days.map((d) => (Array.isArray(d?.meals) ? d.meals : []).map((m) => m?.name || '').join('·')).join('|')}`;
}

/**
 * El plan con las traducciones de `res` (la respuesta de `/guest-display`) fusionadas. Una traducción sólo entra si
 * el plato de esa posición sigue siendo el que se tradujo (`name`): el invitado pudo cambiarlo mientras volvía.
 * Devuelve el MISMO objeto si no hay nada que fusionar (así `setPlanData` no re-renderiza por nada).
 */
export function fusionarTraduccion(plan, res, locale) {
    if (!plan || !res || typeof res !== 'object' || !locale || locale === 'es-DO') return plan;
    let cambio = false;
    const days = Array.isArray(plan.days) ? [...plan.days] : [];
    for (const it of (Array.isArray(res.meals) ? res.meals : [])) {
        const { day, meal, name, display } = it || {};
        if (!Number.isInteger(day) || !Number.isInteger(meal) || !display || typeof display !== 'object') continue;
        const d = days[day];
        const comidas = Array.isArray(d?.meals) ? d.meals : null;
        const m = comidas ? comidas[meal] : null;
        if (!m || typeof m !== 'object' || (typeof name === 'string' && m.name !== name)) continue;
        const nuevas = [...comidas];
        nuevas[meal] = { ...m, _display: { ...(m._display && typeof m._display === 'object' ? m._display : {}), [locale]: display } };
        days[day] = { ...d, meals: nuevas };
        cambio = true;
    }
    const nombre = typeof res.plan_name === 'string' && res.plan_name.trim() ? res.plan_name : null;
    const insights = Array.isArray(res.insights) && res.insights.length ? res.insights : null;
    let planDisplay = plan._display;
    if (nombre || insights) {
        const previo = plan._display && typeof plan._display === 'object' ? plan._display : {};
        planDisplay = {
            ...previo,
            [locale]: { ...(previo[locale] || {}), ...(nombre ? { name: nombre } : {}), ...(insights ? { insights } : {}) },
        };
        cambio = true;
    }
    if (!cambio) return plan;
    return { ...plan, days, ...(planDisplay ? { _display: planDisplay } : {}) };
}

// Una petición por (idioma, platos) y ninguna mientras otra va en vuelo: el efecto que la dispara corre en cada render.
let _estado = { firma: null, enVuelo: false };

/**
 * Pide la traducción del plan del invitado y la fusiona con `setPlanData` (y en su copia local). Nada si no falta o
 * si ya se pidió para estos platos; si falla, el plan sigue en español, como antes: nunca bloquea nada.
 */
export async function traducirPlanDelInvitado(plan, locale, setPlanData) {
    if (!faltaTraduccion(plan, locale) || typeof setPlanData !== 'function') return;
    const firma = firmaDeTraduccion(plan, locale);
    if (_estado.enVuelo || _estado.firma === firma) return;
    _estado = { firma, enVuelo: true };
    try {
        const r = await fetchWithAuth('/api/plans/guest-display', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                locale,
                plan_data: { days: plan.days, name: plan.name, insights: plan.insights, _display: plan._display },
            }),
        });
        if (!r.ok) return;
        const res = await r.json().catch(() => null);
        if (!res || getLocale() !== locale) return;
        setPlanData((prev) => {
            const fusionado = fusionarTraduccion(prev, res, locale);
            if (fusionado !== prev) safeLocalStorageSet('mealfit_plan', fusionado);
            return fusionado;
        });
    } catch { /* sin traducción el plan sigue en español; no es un error del usuario */ }
    finally {
        _estado = { ..._estado, enVuelo: false };
    }
}

/** Sólo para pruebas. */
export function _reiniciarParaPruebas() {
    _estado = { firma: null, enVuelo: false };
}
