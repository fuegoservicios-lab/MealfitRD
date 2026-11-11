// [MICROS-ORIGEN · 2026-11-11] «Me pasé de sodio, ¿con qué?». El detalle de cada nutriente dice qué alimentos
// aportaron más (nombre, comida, cantidad, %), qué comidas no tienen dato y de qué fuentes salió — ya no una lista
// de códigos «usda, usda, manual». El recálculo del cliente (`resumirMicros`) da lo mismo que el servidor.
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import MicrosList from '../components/dashboard/MicrosList';
import { resumirMicros } from '../components/dashboard/microsShared';

const METAS = { sodium_mg: { target: 2000, kind: 'ceiling', unit: 'mg', reference_type: 'WHO', source: 'https://www.who.int/x' } };

const MEALS = [
    { meal_name: 'Desayuno', meal_type: 'desayuno', micros: { values: { sodium_mg: 1470 }, coverage: { sodium_mg: { status: 'complete' } },
        provenance: { sodium_mg: [{ source: 'usda', fdc_id: 1 }, { source: 'usda', fdc_id: 2 }, { source: 'manual', fdc_id: null }] },
        items: [{ label: '80 g de Salami', values: { sodium_mg: 980 } }, { label: '2 unidades de Pan de agua', values: { sodium_mg: 420 } }, { label: '1 unidad de Huevo', values: { sodium_mg: 70 } }] } },
    { meal_name: 'Cena', meal_type: 'cena', micros: { values: { sodium_mg: 936 }, coverage: { sodium_mg: { status: 'partial' } },
        items: [{ label: '1 cubito de caldo', values: { sodium_mg: 900 } }, { label: '100 g de Arroz', values: { sodium_mg: 36 } }, { label: 'Sal al gusto', values: {} }] } },
    { meal_name: 'Almuerzo', meal_type: 'almuerzo', micros: null },
];

describe('MicrosList · de dónde vino cada nutriente', () => {
    it('resumirMicros ordena los aportes y nombra lo que falta', () => {
        const { micros, coverage } = resumirMicros(MEALS);
        const s = coverage.by_nutrient.sodium_mg;
        expect(micros.sodium_mg).toBe(2406);
        expect(s.top.map((a) => a.food)).toEqual(['80 g de Salami', '1 cubito de caldo', '2 unidades de Pan de agua', '1 unidad de Huevo', '100 g de Arroz']);
        expect(s.top[0]).toEqual({ food: '80 g de Salami', meal: 'Desayuno', meal_type: 'desayuno', value: 980 });
        expect(s.missing).toEqual([
            { meal: 'Cena', meal_type: 'cena', foods: ['Sal al gusto'], whole_meal: false },
            { meal: 'Almuerzo', meal_type: 'almuerzo', foods: [], whole_meal: true },
        ]);
    });

    it('el panel muestra alimentos y comidas, no códigos de fuente', () => {
        const { micros, coverage } = resumirMicros(MEALS);
        render(<MicrosList micros={micros} coverage={coverage} metas={METAS} />);
        const fila = screen.getByText('Sodio').closest('li');
        const f = within(fila);
        expect(f.queryByText('80 g de Salami')).toBeNull(); // cerrado: el detalle no se monta
        const det = fila.querySelector('details');
        det.open = true;
        fireEvent(det, new Event('toggle'));
        expect(f.getByText('80 g de Salami')).toBeInTheDocument();
        expect(f.getByText('41%')).toBeInTheDocument();
        expect(f.getByText('Calculado con 2 de 3 comidas. Lo que no tiene datos no se suma, así que el total real puede ser mayor.')).toBeInTheDocument();
        expect(f.getByText('toda la comida (foto o registro sin ingredientes)')).toBeInTheDocument();
        expect(f.getByText('Sal al gusto')).toBeInTheDocument();
        expect(f.getByText('80 g de Salami aportó el 41% de tu sodio registrado.')).toBeInTheDocument();
        expect(f.getByText(/OMS/)).toBeInTheDocument();
        expect(f.queryByText(/WHO/)).toBeNull();
        expect(f.queryByText('usda')).toBeNull();
        expect(f.getByText('USDA FoodData Central (2)', { exact: false })).toBeInTheDocument();
        expect(f.getByText('406 mg sobre el máximo recomendado (120%) · puede ser más')).toBeInTheDocument();
        // la marca del límite queda donde termina el máximo dentro de la barra reescalada
        const barra = f.getByRole('progressbar', { name: 'Sodio' });
        expect(barra.lastChild.style.left).toBe('83%');
        expect(barra.getAttribute('aria-valuetext')).toMatch(/^al menos 2,406 mg/);
    });
});
