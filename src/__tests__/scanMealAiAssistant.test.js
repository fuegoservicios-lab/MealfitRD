// [P1-SCAN-AI-ASSISTANT-MODAL · 2026-10-20] Tests para el asistente de IA y adición de alimentos dentro del modal de escaneo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    platoDesdeAnalisis, macrosDelPlato, conComponenteAgregado, platoConAjusteIA,
} from '../components/dashboard/scanMealDishes';

const mac = (calories, protein = 0, carbs = 0, healthy_fats = 0) => ({ calories, protein, carbs, healthy_fats });

const ANALISIS_BASE = {
    meal_name: 'Pollo con arroz y ensalada',
    macros: mac(650, 40, 70, 15),
    items: [
        { name: 'Pechuga de pollo', quantity: 150, unit: 'g', macros: mac(250, 35, 0, 5) },
        { name: 'Arroz blanco', quantity: 200, unit: 'g', macros: mac(260, 5, 58, 1) },
        { name: 'Ensalada verde', quantity: 100, unit: 'g', macros: mac(140, 0, 12, 9) },
    ],
};

describe('[P1-SCAN-AI-ASSISTANT-MODAL] conComponenteAgregado', () => {
    it('agrega un nuevo componente al plato y actualiza las macros en vivo', () => {
        const p0 = platoDesdeAnalisis(ANALISIS_BASE);
        expect(macrosDelPlato(p0).calories).toBe(650);
        expect(p0.componentes.length).toBe(3);

        const nuevoAlimento = {
            name: 'Jugo de naranja natural',
            display: 'Jugo de naranja',
            qty: 1,
            unit: 'vaso',
            macros: mac(110, 2, 26, 0.5),
        };

        const p1 = conComponenteAgregado(p0, nuevoAlimento);
        expect(p1.componentes.length).toBe(4);
        const agregado = p1.componentes[3];
        expect(agregado.name).toBe('Jugo de naranja natural');
        expect(agregado.display).toBe('Jugo de naranja');
        expect(agregado.qty).toBe(1);
        expect(agregado.unit).toBe('vaso');
        expect(agregado.checked).toBe(true);

        // Las macros deben sumar 650 + 110 = 760 kcal
        expect(macrosDelPlato(p1).calories).toBe(760);
        expect(macrosDelPlato(p1).carbs).toBe(96);
    });

    it('funciona incluso en un plato sin componentes previos', () => {
        const vacio = { meal_name: 'Café', macros: mac(5), items: [] };
        const p0 = platoDesdeAnalisis(vacio);
        const nuevo = {
            name: 'Huevo hervido',
            display: 'Huevo hervido',
            qty: 2,
            unit: 'unidad',
            macros: mac(156, 12.6, 1.1, 10.6),
        };
        const p1 = conComponenteAgregado(p0, nuevo);
        expect(p1.componentes.length).toBe(1);
        expect(macrosDelPlato(p1).calories).toBe(156);
        expect(p1.desglose).toBe(true);
    });
});

describe('[P1-SCAN-AI-ASSISTANT-MODAL] platoConAjusteIA', () => {
    it('ajusta el plato con la respuesta de la IA (cambia componentes y recalcula base)', () => {
        const p0 = platoDesdeAnalisis(ANALISIS_BASE);
        const respuestaIA = {
            nombre: 'Pollo con moro de habichuelas y aguacate',
            componentes: [
                { name: 'Pechuga de pollo', display: 'Pechuga de pollo', qty: 150, unit: 'g', macros: mac(250, 35, 0, 5) },
                { name: 'Moro de habichuelas', display: 'Moro de habichuelas', qty: 200, unit: 'g', macros: mac(310, 9, 55, 4) },
                { name: 'Aguacate', display: 'Aguacate', qty: 60, unit: 'g', macros: mac(96, 1, 5, 9) },
            ],
        };

        const p1 = platoConAjusteIA(p0, respuestaIA);
        expect(p1.nombre).toBe('Pollo con moro de habichuelas y aguacate');
        expect(p1.componentes.length).toBe(3);
        expect(p1.componentes.some((c) => c.name === 'Aguacate')).toBe(true);
        expect(p1.componentes.some((c) => c.name === 'Ensalada verde')).toBe(false);

        // Macros recalculadas: 250 + 310 + 96 = 656 kcal
        expect(macrosDelPlato(p1).calories).toBe(656);
        expect(p1.redescrito).toBe(true);
    });
});

describe('[P1-SCAN-AI-ASSISTANT-MODAL] ScanMealModal UI integración', () => {
    it('ScanMealModal incluye llamadas a los nuevos endpoints de IA', () => {
        const src = readFileSync(resolve(__dirname, '..', 'components', 'dashboard', 'ScanMealModal.jsx'), 'utf8');
        expect(src).toContain('/api/diary/scan/ajustar-plato');
        expect(src).toContain('/api/diary/scan/agregar-ingrediente');
        expect(src).toContain('Ajustar plato con IA');
        expect(src).toContain('Añadir alimento');
        expect(src).toContain('Escribir plato');
    });
});
