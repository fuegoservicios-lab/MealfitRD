// [P1-MANUAL-FOOD-LOG · 2026-08-11] Constantes COMPARTIDAS entre las dos vías de
// registrar comida: el escáner de fotos (ScanMealModal) y el componedor manual
// (LogMealModal). Vivían dentro del escáner; se EXTRAEN, no se copian — el precedente
// es CameraViewfinder (P1-SCANNER-SHARED): una copia garantiza que el próximo ajuste
// entre en una y la otra siga emitiendo lo viejo.

export const MEAL_TYPES = [
    { value: 'desayuno', label: 'Desayuno' },
    { value: 'almuerzo', label: 'Almuerzo' },
    { value: 'cena', label: 'Cena' },
    { value: 'merienda', label: 'Merienda' },
];

// La quinta opción, SOLO del componedor manual. `extra` no está en el mapa de slots
// del emparejamiento diario↔plan (`_SLOT_CANON_MAP`): no atenúa ningún plato del plan
// ni bloquea swap/PDF (P1-EATEN-RECIPE-LOCK). Las kcal cuentan igual. El escáner no
// la ofrece a propósito: su flujo nació atado a los slots del plan y cambiarle el
// default es otra conversación.
export const MEAL_TYPE_EXTRA = { value: 'extra', label: 'Extra (fuera del plan)' };

// Auto-detección del tipo de comida por la hora local. Editable después.
export const guessMealType = () => {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return 'desayuno';
    if (h >= 11 && h < 15) return 'almuerzo';
    if (h >= 18 && h < 23) return 'cena';
    return 'merienda';
};

// Límites espejo de ConsumedMealRequest (backend) — evita 422 en /consumed.
export const MACRO_MAX = { calories: 10000, protein: 1000, carbs: 2000, healthy_fats: 1000 };

export const clampMacro = (key, raw) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, MACRO_MAX[key] ?? 100000);
};
