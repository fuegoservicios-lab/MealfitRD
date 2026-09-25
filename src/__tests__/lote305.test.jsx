/**
 * [P1-PLAN-LOTE-305 · 2026-09-25] Lo que la foto no deja saber («¿Cuántos huevos eran?») llega del análisis como
 * `dudas` y el escáner lo muestra junto al plato, para corregirlo antes de registrar.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { platoDesdeAnalisis } from '../components/dashboard/scanMealDishes';

describe('[305] dudas de la foto en el escáner', () => {
    it('el plato guarda las dudas del análisis (máx. 2, sin basura)', () => {
        const p = platoDesdeAnalisis({
            meal_name: 'Huevos revueltos', macros: { calories: 280 }, items: [],
            dudas: [{ sobre: 'huevo', pregunta: '¿Cuántos huevos eran?' }, { pregunta: '' }, 'x',
                { sobre: 'aceite', pregunta: '¿Con aceite o mantequilla?' }, { pregunta: '¿Una tercera?' }],
        });
        expect(p.dudas).toEqual([
            // [P1-PLAN-LOTE-322] cada duda trae ahora sus opciones de un toque (aquí ninguna)
            { sobre: 'huevo', pregunta: '¿Cuántos huevos eran?', opciones: [] },
            { sobre: 'aceite', pregunta: '¿Con aceite o mantequilla?', opciones: [] },
        ]);
        expect(platoDesdeAnalisis({ macros: {} }).dudas).toEqual([]);
    });

    it('el editor del plato las pinta sobre «¿Qué es?»', () => {
        const src = readFileSync(resolve(__dirname, '..', 'components', 'dashboard', 'ScanMealModal.jsx'), 'utf8');
        expect(src).toContain("t('Revisa esto antes de registrar:')");
        expect(src).toContain('plato.dudas');
    });
});
