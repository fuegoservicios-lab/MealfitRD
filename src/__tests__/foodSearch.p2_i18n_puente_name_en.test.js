/**
 * [P2-I18N-BUSCADOR-CATALOGO-PUENTE-EN-1-DE-4 · 2026-08-23] El puente `name_en` del catálogo
 * se cableó en 1 de los 4 buscadores.
 *
 * `P2-I18N-CATALOGO-BUSCADOR-SIN-PUENTE` (22-ago) puso `name_en` en la proyección del
 * endpoint y en el filtro de QStapleFoods («Mis básicos»). Los otros tres —el componedor del
 * DIARIO (`searchFoods`), y los dos de la NEVERA (añadir ítem y el autocompletado)— siguen
 * exigiendo español: un usuario en inglés que escribe «chicken» para registrar su almuerzo
 * recibe cero resultados, en la pantalla que usa a diario.
 *
 * Lo que NO cambia, y es la frontera: lo que se SELECCIONA sigue siendo la fila canónica
 * española (`f.name`). `name_en` es una segunda VÍA DE ENTRADA al mismo identificador, no un
 * nombre alternativo. Y cubre UN idioma de cuatro — `name_en` es un gloss inglés, no un
 * catálogo multilingüe — y eso se dice en el código, igual que en QStapleFoods.
 */
import { describe, it, expect } from 'vitest';
import { searchFoods } from '../utils/foodSearch';

const FOODS = [
    { id: 1, name: 'Pechuga de pollo', name_en: 'Chicken breast', aliases: [], portions: [] },
    { id: 2, name: 'Arroz blanco', name_en: 'White rice', aliases: ['arroz'], portions: [] },
    { id: 3, name: 'Habichuelas rojas', name_en: 'Red beans', aliases: [], portions: [] },
];

describe('[P2-I18N-BUSCADOR-CATALOGO-PUENTE-EN-1-DE-4] searchFoods', () => {
    it('EL CASO: «chicken» encuentra la pechuga de pollo', () => {
        const r = searchFoods('chicken', FOODS, []);
        expect(r.map((x) => x.item.name), 'el diario sigue exigiendo español').toContain('Pechuga de pollo');
    });

    it('lo que se selecciona sigue siendo el nombre CANÓNICO español (la frontera)', () => {
        const r = searchFoods('rice', FOODS, []);
        expect(r[0].label).toBe('Arroz blanco');
        expect(r[0].ref).toBe('food:2');
    });

    it('el nombre español sigue ganando al inglés en empate de rank', () => {
        // Buscar «arroz» casa el nombre propio (rank 1) — el inglés no debe desplazarlo.
        const r = searchFoods('arroz', FOODS, []);
        expect(r[0].item.name).toBe('Arroz blanco');
    });

    it('una fila sin name_en no revienta', () => {
        const sin = [{ id: 9, name: 'Yuca', aliases: [], portions: [] }];
        expect(() => searchFoods('cassava', sin, [])).not.toThrow();
        expect(searchFoods('yuca', sin, []).length).toBe(1);
    });
});
