// [P3-C · 2026-05-08] Helpers de estimación de consumo para la nevera (Pantry).
//
// Por qué existe: el cálculo REAL del consumo per-item vive en backend
// (`_compute_dynamic_consumption_rates` en `db_inventory.py`) y depende del
// plan activo + householdComposition. Ese rate dinámico NO está expuesto al
// UI hoy. Sin un indicador visual el usuario veía cantidades bajar sin
// entender por qué — soporte recibía tickets "¿por qué baja sin haber
// consumido?". El badge orientativo en la UI (Pantry.jsx) cierra esa
// confusión.
//
// Espejo simplificado de las heurísticas legacy en `db_inventory.py:417-428`
// (mapping categoría → g/día base). NO incluye ajuste por household ni el
// override dinámico del plan activo (P2-2). Es estimación, NO contrato:
// el flujo de gating (predicción de "días hasta agotarse" → push al usuario)
// sigue corriendo en backend con la lógica completa.
//
// Trade-off aceptado: si el backend evoluciona los rates por categoría, este
// helper queda stale visualmente pero NO rompe nada funcional. Sincronizar
// vía test cross-language no vale el costo de un PR-gate por un badge UX.

/**
 * Estima el consumo diario aproximado de un ingrediente según su categoría.
 *
 * @param {string|null|undefined} category — categoría display del item.
 * @param {string|null|undefined} unit — unidad base del item (g, ml, unidad...).
 * @returns {{rate: number, unit: string} | null}
 *   - `null` si la categoría no es estimable (especias, hierbas, condimentos,
 *     grasas, dulces, bebidas, panadería, frutos secos: rate diario es
 *     despreciable o muy variable según receta — mostrar un número engañaría).
 *   - `{rate, unit}` para categorías core (proteínas, granos, vegetales,
 *     frutas, lácteos, huevos).
 */
export const getEstimatedDailyConsumption = (category, unit) => {
    if (!category) return null;
    const cat = String(category).toUpperCase().trim();
    const u = String(unit || '').toLowerCase().trim();
    const isDiscrete = ['unidad', 'u', 'ud', 'unid', 'pieza', 'pza'].some(
        (x) => u === x || u.includes(x)
    );

    // Huevos: 1 unidad/día (ratio típico DR omnívoro).
    if (cat.startsWith('HUEVO')) return { rate: 1, unit: 'unid' };
    // Frutas: discrete=1 pieza/día (manzana, plátano), peso=150 g/día (frutos
    // pequeños vendidos a peso).
    if (cat.startsWith('FRUTA')) {
        return isDiscrete ? { rate: 1, unit: 'unid' } : { rate: 150, unit: 'g' };
    }
    // Proteínas animales (mismo bucket que el backend: carne/pollo/pescado/marisco).
    if (
        cat.includes('PROTEÍN') ||
        cat.includes('PROTEIN') ||
        cat.startsWith('CARN') ||
        cat.startsWith('POLL') ||
        cat.startsWith('PESCAD') ||
        cat.startsWith('AVE') ||
        cat.startsWith('MARISC')
    ) {
        return { rate: 150, unit: 'g' };
    }
    // Carbohidratos / granos / legumbres / víveres (arroz, pasta, lentejas, etc.).
    if (
        cat.includes('GRANO') ||
        cat.includes('CEREAL') ||
        cat.includes('LEGUMBR') ||
        cat.includes('DESPENSA') ||
        cat.includes('VÍVERES') ||
        cat.includes('VIVERES')
    ) {
        return { rate: 100, unit: 'g' };
    }
    // Vegetales / verduras / hortalizas.
    if (cat.includes('VEGETAL') || cat.includes('VERDURA') || cat.includes('HORTALIZA')) {
        return { rate: 80, unit: 'g' };
    }
    // Lácteos: 200 g/ml/día (un yogur o vaso de leche estándar).
    if (
        cat.includes('LÁCTEO') ||
        cat.includes('LACTEO') ||
        cat.includes('LECHE') ||
        cat.includes('QUESO')
    ) {
        return { rate: 200, unit: u === 'ml' ? 'ml' : 'g' };
    }
    // Resto no estimable.
    return null;
};
