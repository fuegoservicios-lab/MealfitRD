// [P1-ARQ25-F4-FORM · 2026-09-03] Contrato frontend↔backend de la política del plan (Fase 4 del
// roadmap 2.5). SSOT del backend: `backend/plan_policy.py` (POLICY_SCHEMA_VERSION, RECURRENCE_MODES,
// FREEZER_MODES, BATCH_MODES, SLOTS, PREPARATION_MODES, _REASON_COPY). El test
// `backend/tests/test_p1_arq25_f4_form.py` lee ESTE archivo y falla si un enum o un reason code
// deja de coincidir: el formulario escribe intención con los valores exactos que el compilador
// entiende, y la pantalla «solicitaste / aplicamos / por qué» sabe explicar cada relajación.

import { formatNumber } from '../i18n';

// Knob del formulario progresivo (VITE_PLAN_POLICY_FORM). Encendido salvo '0' / 'false' / 'off'.
export const PLAN_POLICY_FORM_UI = !['0', 'false', 'off'].includes(
    String(import.meta.env.VITE_PLAN_POLICY_FORM ?? '').toLowerCase(),
);

export const POLICY_SCHEMA_VERSION = 1;

export const MEAL_ORGANIZATION_MODES = ['routine', 'balanced', 'explore'];
export const FREEZER_MODES = ['none', 'limited', 'full'];
export const BATCH_MODES = ['never', 'sometimes', 'often'];
export const FRESH_TOPUP_VALUES = ['yes', 'no'];
export const ANCHOR_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const PREPARATION_MODES = ['vary_preparation', 'same_preparation'];
// Frecuencia semanal de un básico: tres bandas legibles que el backend recibe como min/max por 7 días.
export const ANCHOR_FREQUENCIES = [
    { id: 'some', min: 2, max: 3 },
    { id: 'most', min: 4, max: 5 },
    { id: 'daily', min: 7, max: 7 },
];
// Ciclos de compra en los que tiene sentido preguntar por reposiciones de frescos.
export const CYCLE_NEEDS_TOPUP = ['biweekly', 'monthly'];
export const CYCLE_DAYS = { weekly: 7, biweekly: 15, monthly: 30 };

export const RELAXATION_REASON_CODES = [
    'anchor_conflicts_allergy', 'anchor_conflicts_diet', 'anchor_not_in_market',
    'budget_advisory_no_prices', 'budget_below_floor', 'cycle_shortened_no_freezer_no_topup',
    'recurrence_clamped', 'anchors_capped', 'pantry_proteins_after_first_week',
];

export const modeLabel = (t, mode) => ({
    routine: t('Rutina'), balanced: t('Equilibrio'), explore: t('Exploración'),
})[mode] || mode;

export const modeDescription = (t, mode) => ({
    routine: t('Me funciona repetir'),
    balanced: t('Algunas comidas fijas y otras diferentes'),
    explore: t('Prefiero cambiar con frecuencia'),
})[mode] || '';

export const slotLabel = (t, slot) => ({
    breakfast: t('Desayuno'), lunch: t('Almuerzo'), dinner: t('Cena'), snack: t('Merienda'),
})[slot] || slot;

export const freezerLabel = (t, mode) => ({
    none: t('Sin congelar'), limited: t('Congelo algo'), full: t('Congelo sin problema'),
})[mode] || mode;

export const batchLabel = (t, mode) => ({
    never: t('Cocino al día'), sometimes: t('A veces cocino de más'), often: t('Cocino por tandas'),
})[mode] || mode;

/* [P2-POLICY-PANEL-COPY · 2026-09-05] Las etiquetas de arriba son las del FORMULARIO (primera persona: el usuario
   eligiendo). En el panel del plan quien habla es la app describiendo lo que hizo, así que el registro cambia a
   segunda persona y frase completa. Dos juegos de copy para dos contextos, no uno reutilizado a medias. */
export const freezerFact = (t, mode) => ({
    none: t('Sin congelar alimentos'), limited: t('Congelas algunos alimentos'), full: t('Congelas sin problema'),
})[mode] || freezerLabel(t, mode);

export const batchFact = (t, mode) => ({
    never: t('Cocinas cada día'), sometimes: t('A veces cocinas de más'), often: t('Cocinas por tandas'),
})[mode] || batchLabel(t, mode);

export const topupFact = (t, days) => (days
    ? t('Compras frescos cada {n} días', { n: days })
    : t('Sin compras adicionales'));

export const frequencyLabel = (t, id) => ({
    some: t('2-3 veces por semana'), most: t('4-5 veces por semana'), daily: t('Todos los días'),
})[id] || id;

export const preparationLabel = (t, mode) => ({
    vary_preparation: t('Preparación variada'), same_preparation: t('Siempre igual'),
})[mode] || mode;

/** Banda legible que corresponde a un min/max por 7 días (o null si es una banda a medida). */
export const frequencyIdFor = (min, max) => {
    const hit = ANCHOR_FREQUENCIES.find((f) => f.min === Number(min) && f.max === Number(max));
    return hit ? hit.id : null;
};

/** Ancla del formulario (`stapleAnchors[i]`) con defaults explícitos. */
export const anchorDefaults = (name) => ({
    name, slots: [], min_per_7d: 2, max_per_7d: 7, preparation_mode: 'vary_preparation',
});

export const relaxationIsBlocking = (r) => r?.action === 'waiting_user';

const _num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? formatNumber(Math.round(n)) : String(v ?? '');
};

/** Copy de cada relajación (espejo traducible de `_REASON_COPY` del backend). */
/* [P2-POLICY-PANEL-COPY · 2026-09-05] Cada motivo se presenta con TITULAR (qué pasó, en positivo) y explicación
   debajo. Antes era un párrafo suelto en una viñeta ámbar: el usuario tenía que leerlo entero para saber si le
   afectaba. Sin titular propio se cae al genérico. */
export const relaxationTitle = (t, r) => {
    switch (r?.reason_code) {
        case 'budget_advisory_no_prices':
            return t('Presupuesto aproximado');
        case 'budget_below_floor':
            return t('Presupuesto por debajo del mínimo');
        case 'pantry_proteins_after_first_week':
            return t('Organizamos tus alimentos para todo el ciclo');
        case 'anchor_conflicts_allergy':
        case 'anchor_conflicts_diet':
        case 'anchor_not_in_market':
            return t('Un alimento habitual no se pudo usar');
        case 'anchors_capped':
            return t('Guardamos tus primeros alimentos habituales');
        case 'recurrence_clamped':
            return t('Ajustamos la frecuencia pedida');
        default:
            return t('Un ajuste en tu plan');
    }
};

export const relaxationCopy = (t, r) => {
    const ev = r?.evidence || {};
    switch (r?.reason_code) {
        case 'anchor_conflicts_allergy':
            return t('Quitamos «{requested}» de tus básicos: choca con una alergia declarada ({allergy}).', { requested: r.requested, allergy: ev.allergy });
        case 'anchor_conflicts_diet':
            return t('Quitamos «{requested}» de tus básicos: no encaja con tu dieta ({diet}).', { requested: r.requested, diet: ev.diet });
        case 'anchor_not_in_market':
            return t('«{requested}» no está en el catálogo de tu país; no lo usamos como básico.', { requested: r.requested });
        case 'budget_advisory_no_prices':
            return t('Aún no contamos con precios de tu país. Usamos tu presupuesto como referencia, pero no podemos garantizar que el costo final se mantenga dentro de él.');
        case 'budget_below_floor':
            return t('Tu presupuesto ({amount}) está por debajo del mínimo para un plan que cumpla tus metas ({floor}). Súbelo o ajusta las metas.', { amount: _num(ev.amount_dop), floor: _num(ev.floor_dop) });
        case 'cycle_shortened_no_freezer_no_topup':
            return t('Sin congelador ni reposición de frescos, el ciclo de compra pasa a 7 días.');
        case 'pantry_proteins_after_first_week':
            return t('Como no congelas ni haces compras adicionales, priorizamos las carnes y los pescados frescos al inicio. Después, incluimos huevos, enlatados, legumbres y quesos curados.');
        case 'recurrence_clamped':
            return t('La frecuencia pedida se ajustó al rango posible (0–7 por semana).');
        case 'anchors_capped':
            return t('Solo los primeros {n} básicos se usan como anclas.', { n: r.applied });
        default:
            return String(r?.reason_code || '');
    }
};
