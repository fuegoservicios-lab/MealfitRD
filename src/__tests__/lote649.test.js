// [P1-PLAN-LOTE-649 · 2026-09-27] Un español lee «guineo (plátano)», no «guineo» a secas.
//
// El identificador del alimento es dominicano en los seis países y el plan lo copia. Con la app en español y el país
// del usuario en España, México, Colombia o Puerto Rico, el nombre local va entre paréntesis tras el identificador
// (la primera vez en cada texto). No se sustituye: el identificador es lo que el motor resuelve y cambiarlo rompería
// la concordancia («la batata asada» → «la boniato asada»). En RD, en EE. UU. y en los otros idiomas, nada cambia.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { glosarTexto, setPaisDeLectura } from '../utils/nombresDelPais';
import { mealDisplay } from '../utils/displayMeal';

afterEach(() => setPaisDeLectura(null));

describe('[649] glosa del nombre local', () => {
    it('añade el nombre del país tras el identificador, conservando la frase', () => {
        expect(glosarTexto('1 guineo mediano', 'ES')).toBe('1 guineo (plátano) mediano');
        expect(glosarTexto('Pan de agua con Guineo', 'MX')).toBe('Pan de agua con Guineo (plátano)');
        expect(glosarTexto('½ taza de habichuelas negras cocidas', 'MX'))
            .toBe('½ taza de habichuelas negras (frijoles negros) cocidas');
    });

    it('el nombre más largo gana y solo la primera vez', () => {
        expect(glosarTexto('1 guineo verde y 1 guineo', 'ES')).toBe('1 guineo verde (plátano verde) y 1 guineo (plátano)');
        expect(glosarTexto('pela el guineo; corta el guineo', 'ES')).toBe('pela el guineo (plátano); corta el guineo');
    });

    it('no toca palabras que solo contienen el nombre ni repite una glosa', () => {
        expect(glosarTexto('1 taza de papaya', 'ES')).toBe('1 taza de papaya');
        expect(glosarTexto('1 guineo (plátano)', 'ES')).toBe('1 guineo (plátano)');
    });

    it('en RD, en EE. UU. o sin país, el texto no cambia', () => {
        for (const p of ['DO', 'US', null, undefined, 'XX']) expect(glosarTexto('1 guineo mediano', p)).toBe('1 guineo mediano');
        expect(glosarTexto('1 guineo mediano', 'PR')).toBe('1 guineo mediano');   // en Puerto Rico también es guineo
    });
});

describe('[649] el plan en español se lee con el nombre del país', () => {
    const meal = { name: 'Avena con guineo', description: 'Rápida.', ingredients: ['1 guineo mediano', '½ taza de avena'],
        recipe: ['Corta el guineo.', 'Mezcla.'] };

    it('con el país ES, nombre, ingredientes y pasos llevan la glosa', () => {
        setPaisDeLectura('ES');
        const d = mealDisplay(meal, 'es-DO');
        expect(d.name).toBe('Avena con guineo (plátano)');
        expect(d.ingredients).toEqual(['1 guineo (plátano) mediano', '½ taza de avena']);
        expect(d.recipe).toEqual(['Corta el guineo (plátano).', 'Mezcla.']);
        expect(meal.ingredients[0]).toBe('1 guineo mediano');   // el dato no se toca
    });

    it('en RD el resultado es el de siempre, y en otro idioma manda la traducción', () => {
        setPaisDeLectura('DO');
        const d = mealDisplay(meal, 'es-DO');
        expect(d.ingredients).toBe(meal.ingredients);
        setPaisDeLectura('ES');
        expect(mealDisplay(meal, 'en-US').ingredients).toBe(meal.ingredients);
    });

    it('el país de lectura lo fija el perfil', () => {
        const src = readFileSync(resolve(__dirname, '../context/AssessmentContext.jsx'), 'utf8');
        expect(src).toContain('setPaisDeLectura(');
    });
});

describe('[649] la Nevera y el buscador', () => {
    it('la fila del catálogo se pinta con su nombre local y se encuentra por él', async () => {
        const { nombreDeFila, formasDeBuscar, nombreDelAlimento } = await import('../utils/nombresDeAlimentos');
        const fila = { name: 'Guineo', names: { 'en-US': 'Banana' } };
        setPaisDeLectura('ES');
        expect(nombreDeFila(fila, 'es-DO')).toBe('Guineo (plátano)');
        expect(formasDeBuscar(fila)).toContain('plátano');
        expect(nombreDelAlimento('Guineo', 'es-DO')).toBe('Guineo (plátano)');
        setPaisDeLectura('DO');
        expect(nombreDeFila(fila, 'es-DO')).toBe('Guineo');
        expect(formasDeBuscar(fila)).not.toContain('plátano');
        expect(nombreDelAlimento('Guineo', 'es-DO')).toBe('Guineo');
    });
});
