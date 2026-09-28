// [P1-PLAN-LOTE-650 · 2026-09-27] En Estados Unidos y Puerto Rico la receta dice también los °F (G84).
//
// Los pasos traen la temperatura en °C («horno 180°C 20 min», «74 °C en la parte más gruesa»): un horno o un
// termómetro de cocina de allí marcan °F. Se añade la conversión entre paréntesis —redondeada a 5, como se marca un
// horno— en cualquier idioma, porque va con el PAÍS, no con el idioma. En el resto de países, nada cambia.
import { describe, it, expect, afterEach } from 'vitest';
import { conFahrenheit, setPaisDeLectura } from '../utils/nombresDelPais';
import { mealDisplay } from '../utils/displayMeal';

afterEach(() => setPaisDeLectura(null));

describe('[650] los °F al lado de los °C', () => {
    it('convierte y redondea a 5', () => {
        expect(conFahrenheit('Hornea a 180°C 20 min.', 'US')).toBe('Hornea a 180°C (355 °F) 20 min.');
        expect(conFahrenheit('Hasta 74 °C en la parte más gruesa.', 'PR')).toBe('Hasta 74 °C (165 °F) en la parte más gruesa.');
        expect(conFahrenheit('71 ºC la carne molida y 63 °C las piezas', 'US'))
            .toBe('71 ºC (160 °F) la carne molida y 63 °C (145 °F) las piezas');
    });

    it('no repite una conversión que ya está ni toca otros países', () => {
        expect(conFahrenheit('180 °C (355 °F)', 'US')).toBe('180 °C (355 °F)');
        for (const p of ['DO', 'ES', 'MX', null]) expect(conFahrenheit('180 °C', p)).toBe('180 °C');
    });

    it('en el plan, en cualquier idioma, solo los pasos con temperatura cambian', () => {
        const meal = { name: 'Pollo al horno', ingredients: ['180 g de Pechuga de pollo'],
            recipe: ['Mise en place: sazona.', 'El Toque de Fuego: horno 200°C 25 min.'],
            _display: { 'en-US': { name: 'Baked chicken', description: 'd', ingredients: ['180 g chicken breast (Pechuga de pollo)'],
                recipe: ['Mise en place: season.', 'El Toque de Fuego: oven 200°C 25 min.'] } } };
        setPaisDeLectura('US');
        expect(mealDisplay(meal, 'en-US').recipe[1]).toBe('El Toque de Fuego: oven 200°C (390 °F) 25 min.');
        expect(mealDisplay(meal, 'es-DO').recipe[1]).toBe('El Toque de Fuego: horno 200°C (390 °F) 25 min.');
        expect(mealDisplay(meal, 'es-DO').recipe[0]).toBe('Mise en place: sazona.');
        setPaisDeLectura('DO');
        expect(mealDisplay(meal, 'es-DO').recipe).toBe(meal.recipe);
    });
});
