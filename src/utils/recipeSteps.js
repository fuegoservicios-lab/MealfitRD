import { i18nKey } from '../i18n';

// [P2-RECIPE-NOTES-NOT-STEPS · 2026-07-24] Clasifica un "paso" de receta en ACCIÓN de cocina
// vs ANOTACIÓN informativa.
//
// Defecto reportado (revisión de recetas del owner, plan a060108b): las anotaciones ocupaban
// pasos NUMERADOS del timeline. En "Bocadito Dulce de Lechosa con Queso Cottage" el paso 2 era
// "🌱 Nota del Nutricionista AI: espolvorea semillas de girasol sobre el plato al servir" y el
// paso 3 el MONTAJE — o sea, la receta le pedía servir ANTES de armar el plato. Además infla el
// conteo: una receta de 2 pasos reales se anuncia como de 4.
//
// El emoji NO sirve para clasificar: en los datos reales 💡 y 💪 encabezan ACCIONES legítimas
// ("💡 Acompaña este plato con el arroz blanco cocido de tus ingredientes", "💪 Agrega queso
// cottage a la licuadora y licúa"). Lo que distingue a una anotación es su ETIQUETA, y son tres
// (verificadas contra los planes vivos, no inventadas):
//   🌱 Nota del Nutricionista AI: …   → consejo nutricional
//   ⚠️ Seguridad alimentaria: …       → advertencia sanitaria
//   💡 Ajustamos ligeramente las porciones … → divulgación honesta del motor de macros
//
// Se listan como prefijos tolerantes a emoji/espacios iniciales. Si el backend añade otra
// etiqueta, hay que sumarla acá (y al test) — preferimos una lista explícita a una heurística
// que se coma un paso de cocina real.

const _ANNOTATION_PATTERNS = [
    /nota del nutricionista/i,
    /seguridad alimentaria\s*:/i,
    /ajustamos ligeramente las porciones/i,
];

/**
 * ¿Este "paso" es una anotación informativa (no una acción a ejecutar en orden)?
 * @param {unknown} raw texto del paso
 * @returns {boolean}
 */
export function isRecipeAnnotation(raw) {
    const s = String(raw || '').trim();
    if (!s) return false;
    // Quitar emoji/símbolos iniciales para que el prefijo sea comparable.
    const head = s.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 80);
    return _ANNOTATION_PATTERNS.some((rx) => rx.test(head));
}

/**
 * Numera SOLO las acciones de cocina, preservando el orden original de la lista.
 * @param {Array} steps
 * @returns {Array<{raw: unknown, annotation: boolean, number: number|null}>}
 */
export function numberRecipeSteps(steps) {
    let n = 0;
    return (Array.isArray(steps) ? steps : []).map((raw) => {
        const annotation = isRecipeAnnotation(raw);
        if (!annotation) n += 1;
        return { raw, annotation, number: annotation ? null : n };
    });
}

// [P1-DISPLAY-VOCAB-CERRADO · 2026-08-21] La OTRA mitad del mismo vocabulario cerrado:
// las etiquetas de SECCIÓN. Vivían duplicadas byte a byte en `RecipesView.jsx` y
// `MobileRecipes.jsx`, al lado de un util que ya poseía las anotaciones. Se unifican
// aquí — la lección de P1-DIET-CANON-SSOT, donde tres tablas a mano driftearon.
//
// El prefijo español es un IDENTIFICADOR, no prosa: el backend lo conserva literal
// aunque traduzca el resto de la línea (`plan_display_i18n._VOCAB_CERRADO`), y aquí se
// reconoce por él. Lo que se traduce es el RÓTULO que ve el usuario.
//
// Por eso esto devuelve `titleKey` y NO un título ya traducido: un `t()` a nivel de
// módulo se evalúa al importar y congela la etiqueta en el idioma de arranque —y en
// es-DO parece correcto—. Traduce el componente, en cada render.
export const RECIPE_SECTIONS = [
    { rx: /^mise en place:\s*/i, titleKey: i18nKey('Mise en place') },
    { rx: /^(el\s+)?toque de fuego:\s*/i, titleKey: i18nKey('El Toque de Fuego') },
    { rx: /^montaje:\s*/i, titleKey: i18nKey('Montaje') },
];

/**
 * Separa la etiqueta de sección del cuerpo del paso.
 * @param {unknown} raw texto del paso
 * @returns {{titleKey: string|null, body: string}} `titleKey` es la clave i18n (que en
 *   este motor ES el texto español); el componente la pasa por `t()`.
 */
export function parseRecipeStep(raw) {
    const s = String(raw || '');
    for (const sec of RECIPE_SECTIONS) {
        if (sec.rx.test(s)) return { titleKey: sec.titleKey, body: s.replace(sec.rx, '') };
    }
    return { titleKey: null, body: s };
}
