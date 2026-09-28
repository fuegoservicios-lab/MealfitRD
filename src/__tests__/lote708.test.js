// [P1-PLAN-LOTE-708 · 2026-09-28] (G84) En EE. UU. y Puerto Rico, las onzas al lado de los gramos y mililitros.
//
// El plan persiste «45 g de avena», «270 ml de leche»: son identificadores del motor (cantidades que resuelven la
// Nevera y la lista) y no se tocan. En US/PR la cocina mide en onzas: como los °F del lote 650, se añade la conversión
// entre paréntesis SOLO al pintar, en cualquier idioma, sin tocar ningún nombre. Cantidades de pizca (<15 g/ml) no se
// convierten: «0.1 oz» no ayuda a nadie.
import { afterEach, describe, expect, it } from 'vitest';
import { conOnzas, setPaisDeLectura } from '../utils/nombresDelPais';
import { mealDisplay } from '../utils/displayMeal';
import { formatRegionFor } from '../utils/paisDelUsuario';

afterEach(() => setPaisDeLectura(null));

describe('[708] onzas al lado de gramos y mililitros', () => {
    it('convierte g, kg y ml', () => {
        expect(conOnzas('180 g de Pechuga de pollo', 'US')).toBe('180 g (6.3 oz) de Pechuga de pollo');
        expect(conOnzas('45 g de avena', 'PR')).toBe('45 g (1.6 oz) de avena');
        expect(conOnzas('1,5 kg de yuca', 'US')).toBe('1,5 kg (3.3 lb) de yuca');
        expect(conOnzas('270 ml de leche descremada', 'US')).toBe('270 ml (9.1 fl oz) de leche descremada');
        expect(conOnzas('450 gramos de arroz', 'US')).toBe('450 gramos (16 oz) de arroz');
    });

    it('no convierte pizcas, ni palabras que empiezan por g/l, ni lo ya convertido', () => {
        expect(conOnzas('2 g de sal', 'US')).toBe('2 g de sal');
        expect(conOnzas('4 gotas de limón', 'US')).toBe('4 gotas de limón');
        expect(conOnzas('2 lb de pollo', 'US')).toBe('2 lb de pollo');
        expect(conOnzas('180 g (6.3 oz) de pollo', 'US')).toBe('180 g (6.3 oz) de pollo');
    });

    it('solo en EE. UU. y Puerto Rico', () => {
        for (const p of ['DO', 'ES', 'MX', 'CO', null]) expect(conOnzas('180 g de pollo', p)).toBe('180 g de pollo');
    });

    it('en el plan: ingredientes y pasos, en cualquier idioma; el dato no cambia', () => {
        const meal = { name: 'Pollo', ingredients: ['180 g de Pechuga de pollo'], recipe: ['Hornea a 200°C.', 'Sirve 150 g.'],
            _display: { 'en-US': { name: 'Chicken', description: 'd', ingredients: ['180 g chicken breast (Pechuga de pollo)'],
                recipe: ['Bake at 200°C.', 'Serve 150 g.'] } } };
        setPaisDeLectura('US');
        const en = mealDisplay(meal, 'en-US');
        expect(en.ingredients[0]).toBe('180 g (6.3 oz) chicken breast (Pechuga de pollo)');
        expect(en.recipe).toEqual(['Bake at 200°C (390 °F).', 'Serve 150 g (5.3 oz).']);
        expect(mealDisplay(meal, 'es-DO').ingredients[0]).toBe('180 g (6.3 oz) de Pechuga de pollo');
        expect(meal.ingredients[0]).toBe('180 g de Pechuga de pollo');
        setPaisDeLectura('DO');
        expect(mealDisplay(meal, 'es-DO').ingredients).toBe(meal.ingredients);
    });

    it('formatRegionFor vive en el módulo sin dependencias', () => {
        expect(formatRegionFor('ES', 'es-DO')).toBe('es-ES');
    });
});
