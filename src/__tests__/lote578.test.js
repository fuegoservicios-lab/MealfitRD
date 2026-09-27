// frontend/src/__tests__/lote578.test.js
// [P1-PLAN-LOTE-578 · 2026-09-27] Cuánto corrigió el usuario lo que dijo la IA viaja como `scan_meta` (solo conteos).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    platoDesdeAnalisis, platoDesdeDescripcion, conCantidad, conComponenteAlternado, conPorcion, conMacroTecleada,
    resumenDeCorrecciones,
} from '../components/dashboard/scanMealDishes';

const ANALISIS = {
    meal_name: 'Arroz con pollo',
    macros: { calories: 600, protein: 35, carbs: 70, healthy_fats: 18 },
    items: [
        { name: 'Arroz', quantity: 1, unit: 'taza', macros: { calories: 200, protein: 4, carbs: 45, healthy_fats: 1 } },
        { name: 'Pollo', quantity: 150, unit: 'g', macros: { calories: 400, protein: 31, carbs: 25, healthy_fats: 17 } },
    ],
};
const plato = () => platoDesdeAnalisis(ANALISIS, 'Comida escaneada');

describe('[578] resumenDeCorrecciones', () => {
    it('sin tocar nada: cero correcciones y la kcal de la IA', () => {
        expect(resumenDeCorrecciones(plato())).toEqual({
            componentes: 2, cambiados: 0, cantidades_editadas: 0, desmarcados: 0, porcion: 1, dudas: 0,
            dudas_cambiadas: 0, redescrito: false, nombre_editado: false, macros_tecleadas: false,
            kcal_ia: 600, kcal_final: 600,
        });
    });

    it('cuenta cantidades editadas, desmarcados y macros tecleadas', () => {
        let p = conCantidad(plato(), '1', 200);
        p = conComponenteAlternado(p, '0');
        p = conMacroTecleada(p, 'protein', 60);
        const r = resumenDeCorrecciones(p);
        expect(r.cantidades_editadas).toBe(1);
        expect(r.desmarcados).toBe(1);
        expect(r.macros_tecleadas).toBe(true);
    });

    it('un preset de porción no cuenta como cantidades editadas a mano', () => {
        const r = resumenDeCorrecciones(conPorcion(plato(), 2));
        expect(r.porcion).toBe(2);
        expect(r.cantidades_editadas).toBe(0);
    });

    it('«Descríbelo» se marca, cambia el nombre y reinicia lo de por ingrediente', () => {
        const p = platoDesdeDescripcion(plato(), {
            name: 'Moro con cerdo',
            lineas: [{ name: 'Moro', grams: 200, macros: { kcal: 300, protein: 8, carbs: 50, fats: 6 } }],
        });
        const r = resumenDeCorrecciones(p);
        expect(r).toMatchObject({ redescrito: true, cambiados: 0, cantidades_editadas: 0, nombre_editado: true,
                                  kcal_ia: 600, kcal_final: 300 });
    });

    it('un plato que no nació de un análisis no manda nada', () => {
        expect(resumenDeCorrecciones({ nombre: 'x', componentes: [] })).toBeNull();
    });

    it('el registro lo manda salvo con la analítica desactivada', () => {
        const src = readFileSync(resolve(process.cwd(), 'src/components/dashboard/ScanMealModal.jsx'), 'utf8');
        expect(src).toContain('scan_meta: isAnalyticsOptedOut() ? undefined : (resumenDeCorrecciones(p) || undefined),');
        expect(src).toContain("import { isAnalyticsOptedOut } from '../../utils/analytics';");
    });
});
