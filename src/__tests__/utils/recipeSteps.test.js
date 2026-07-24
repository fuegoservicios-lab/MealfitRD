/**
 * [P2-RECIPE-NOTES-NOT-STEPS · 2026-07-24] Las anotaciones no son pasos de cocina.
 *
 * Defecto (revisión de recetas del owner, plan a060108b): en "Bocadito Dulce de Lechosa con
 * Queso Cottage" el paso **2** era "🌱 Nota del Nutricionista AI: espolvorea semillas de
 * girasol sobre el plato al servir" y el paso **3** el MONTAJE → la receta pedía servir antes
 * de armar el plato. Además una receta de 2 acciones reales se anunciaba como de 4.
 *
 * Los strings de este test salen de los planes VIVOS (query sobre meal_plans), no inventados.
 * Clave: el emoji NO clasifica — 💡 y 💪 encabezan acciones de cocina legítimas.
 */
import { describe, it, expect } from 'vitest';
import { isRecipeAnnotation, numberRecipeSteps } from '../../utils/recipeSteps';

// Textos reales (los 3 marcadores de anotación que existen en producción).
const NOTA = '🌱 Nota del Nutricionista AI: espolvorea semillas de girasol sobre el plato al servir — cierra tu vitamina E del día.';
const SEGURIDAD = '⚠️ Seguridad alimentaria: cocina el huevo por completo (≥71°C, yema y clara firmes, sin partes líquidas) antes de servir.';
const PORCIONES = '💡 Ajustamos ligeramente las porciones para que tus calorías del día cuadren con precisión.';

// Textos reales que SÍ son acciones (misma familia de emoji — la trampa).
const ACOMPANA = '💡 Acompaña este plato con el arroz blanco cocido de tus ingredientes.';
const LICUADORA = '💪 Agrega queso cottage a la licuadora y licúa hasta integrar.';
const INCORPORA = '💪 Incorpora queso cottage a la preparación y mézclalo antes de servir.';
const MISE = 'Mise en place: Corta la lechosa en cubos de 2 cm. Mide el queso cottage y el ajonjolí.';
const MONTAJE = 'Montaje: En un bowl, coloca el queso cottage como base.';


describe('[P2-RECIPE-NOTES-NOT-STEPS] isRecipeAnnotation', () => {
    it('reconoce las tres anotaciones reales', () => {
        for (const s of [NOTA, SEGURIDAD, PORCIONES]) {
            expect(isRecipeAnnotation(s)).toBe(true);
        }
    });

    it('NO confunde acciones de cocina que llevan emoji', () => {
        for (const s of [ACOMPANA, LICUADORA, INCORPORA, MISE, MONTAJE]) {
            expect(isRecipeAnnotation(s)).toBe(false);
        }
    });

    it('tolera vacíos y no-strings', () => {
        for (const s of ['', '   ', null, undefined, 0, {}]) {
            expect(isRecipeAnnotation(s)).toBe(false);
        }
    });
});


describe('[P2-RECIPE-NOTES-NOT-STEPS] numberRecipeSteps', () => {
    it('el caso reportado: la nota no roba el número al montaje', () => {
        const out = numberRecipeSteps([MISE, NOTA, MONTAJE]);
        expect(out.map((s) => s.number)).toEqual([1, null, 2]);
        expect(out[1].annotation).toBe(true);
        // El montaje es el paso 2 de 2, no el 3 de 3.
        expect(out.filter((s) => !s.annotation).length).toBe(2);
    });

    it('preserva el orden original (la nota sigue donde estaba)', () => {
        const out = numberRecipeSteps([MISE, NOTA, MONTAJE]);
        expect(out.map((s) => s.raw)).toEqual([MISE, NOTA, MONTAJE]);
    });

    it('varias anotaciones seguidas no rompen la numeración', () => {
        const out = numberRecipeSteps([MISE, SEGURIDAD, PORCIONES, MONTAJE, NOTA]);
        expect(out.map((s) => s.number)).toEqual([1, null, null, 2, null]);
    });

    it('una receta sin anotaciones numera igual que antes', () => {
        const out = numberRecipeSteps([MISE, ACOMPANA, MONTAJE]);
        expect(out.map((s) => s.number)).toEqual([1, 2, 3]);
    });

    it('entrada no-array no explota', () => {
        expect(numberRecipeSteps(null)).toEqual([]);
        expect(numberRecipeSteps(undefined)).toEqual([]);
    });
});
