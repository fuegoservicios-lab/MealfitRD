// [P1-MACRO-BADGE-DIA-EN-BANDA · 2026-08-05] El chip «este plato se desvía de tus macros»
// se calla cuando el DÍA cierra en banda.
//
// CASO REAL. El 2026-08-05 el dueño vio ese chip en un día que había cerrado con
// `band_score=1.0` y los CUATRO macros dentro de banda. El flag lo pone el backend cuando
// la proteína de UNA comida se aleja >15% del objetivo de SU slot — pero las comidas se
// compensan entre sí y la unidad que cuenta nutricionalmente es el día.
//
// El aviso contradecía al propio sistema y no era accionable: cambiar ese plato habría
// empeorado un día que ya estaba exacto.

import { describe, it, expect } from 'vitest';
import { getMealAdvisories, diaEnBandaObjetivo } from '../utils/mealAdvisories';

// Los objetivos reales del plan del owner.
const METAS = { protein: '123g', carbs: '271g', fats: '58g' };
const KCAL = 2100;

// Un día que suma exactamente los objetivos, repartido en 4 comidas.
const diaExacto = () => ([
    { protein: 30, carbs: 68, fats: 14, calories: 525 },
    { protein: 31, carbs: 68, fats: 15, calories: 525 },
    { protein: 31, carbs: 68, fats: 15, calories: 525 },
    { protein: 31, carbs: 67, fats: 14, calories: 525 },
]);

describe('[P1-MACRO-BADGE-DIA-EN-BANDA] diaEnBandaObjetivo', () => {
    it('un dia que suma los objetivos esta en banda', () => {
        expect(diaEnBandaObjetivo(diaExacto(), METAS, KCAL)).toBe(true);
    });

    it('un dia realmente desviado NO esta en banda', () => {
        const d = diaExacto();
        d[0].carbs += 120;            // +44% de carbos sobre el objetivo del dia
        expect(diaEnBandaObjetivo(d, METAS, KCAL)).toBe(false);
    });

    it('acepta objetivos con sufijo "g" (formato del plan)', () => {
        expect(diaEnBandaObjetivo(diaExacto(), METAS, '2100 kcal')).toBe(true);
    });

    it('ante datos ausentes devuelve false: "no se" no es "esta en banda"', () => {
        expect(diaEnBandaObjetivo([], METAS, KCAL)).toBe(false);
        expect(diaEnBandaObjetivo(null, METAS, KCAL)).toBe(false);
        expect(diaEnBandaObjetivo(diaExacto(), null, KCAL)).toBe(false);
        expect(diaEnBandaObjetivo(diaExacto(), METAS, 0)).toBe(false);
        expect(diaEnBandaObjetivo(diaExacto(), { protein: '123g' }, KCAL)).toBe(false);
    });
});

describe('[P1-MACRO-BADGE-DIA-EN-BANDA] el chip', () => {
    const platoDesviado = { _macro_band_low: true };

    it('EL CASO DEL OWNER: dia en banda => el chip NO aparece', () => {
        const chips = getMealAdvisories(platoDesviado, { diaEnBanda: true });
        expect(chips.find((c) => c.key === 'macro_band')).toBeUndefined();
    });

    it('dia FUERA de banda => el chip sigue apareciendo', () => {
        const chips = getMealAdvisories(platoDesviado, { diaEnBanda: false });
        expect(chips.find((c) => c.key === 'macro_band')).toBeDefined();
    });

    it('sin contexto del dia => se muestra (lado seguro)', () => {
        expect(getMealAdvisories(platoDesviado).find((c) => c.key === 'macro_band')).toBeDefined();
        expect(getMealAdvisories(platoDesviado, {}).find((c) => c.key === 'macro_band')).toBeDefined();
    });

    it('los OTROS avisos no se ven afectados por el dia en banda', () => {
        // Solo se silencia el de macros: los demas dicen cosas que el dia no responde.
        const plato = {
            _macro_band_low: true,
            _name_honesty_degraded: true,
            _slot_advisory: true,
        };
        const claves = getMealAdvisories(plato, { diaEnBanda: true }).map((c) => c.key);
        expect(claves).toContain('name_honesty');
        expect(claves).toContain('slot');
        expect(claves).not.toContain('macro_band');
    });
});
