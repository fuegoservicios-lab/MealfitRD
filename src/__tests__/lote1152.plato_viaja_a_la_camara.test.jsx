// [P1-PLAN-LOTE-1152 · 2026-11-21] Ir a la cámara y volver no vacía «Tu plato» (el dueño: «sí» a conservarlo).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import userEvent from '@testing-library/user-event';

const contexto = { value: { userProfile: null, planData: null } };
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => contexto.value }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../consent/consentimientoIA', () => ({ faltaPermisoIA: () => false, asegurarConsentimientoIA: async () => true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import LogMealModal from '../components/dashboard/LogMealModal';
import { fetchWithAuth } from '../config/api';
import { _resetPantryCacheForTests, setCachedMasterList, setCachedDishes } from '../utils/pantryCache';

const FOODS = [
    { id: '11', name: 'Arroz blanco', aliases: [], kcal_per_100g: 130, protein_g_per_100g: 2.7, carbs_g_per_100g: 28, fats_g_per_100g: 0.3,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g' }, { unit: 'taza', grams_per_qty: 158, label: 'taza', default: true }] },
];
const FREQ = [{ last_meal_id: 'b', meal_name: 'Arroz con cerdo guisado', kcal: 630, protein: 32, carbs: 80, fats: 18, veces: 2 }];
const resp = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
    _resetPantryCacheForTests();
    setCachedMasterList(FOODS);
    setCachedDishes([]);
    contexto.value = { userProfile: null, planData: null };
    fetchWithAuth.mockReset();
    fetchWithAuth.mockImplementation(async (url) => {
        if (String(url).includes('/foods/frequent')) return resp({ items: FREQ });
        if (String(url).includes('/estimate-plate')) return resp({ name: 'Arroz con pollo', lineas: [{ ref: 'custom', name: 'Pollo guisado', grams: 150, macros: { kcal: 280, protein: 30, carbs: 2, fats: 16 } }] });
        return resp({ items: [] });
    });
});
afterEach(() => vi.useRealTimers());


describe('[1152] el plato viaja a la cámara y vuelve', () => {
    it('la cámara se lleva el plato, y el componedor nace con él', async () => {
        const user = userEvent.setup();
        const onScan = vi.fn();
        const { unmount } = render(<LogMealModal onClose={vi.fn()} onScan={onScan} />);
        await user.type(screen.getByLabelText('Buscar alimento'), 'arroz');
        await user.click(screen.getByText('Arroz blanco'));
        await user.click(screen.getByRole('button', { name: 'Más Arroz blanco' }));
        await user.click(screen.getByRole('button', { name: 'Escanear con foto' }));
        const d = onScan.mock.calls[0][0];
        expect(d.borrador.lines).toHaveLength(1);
        unmount();
        // vuelta: el padre reabre el componedor con lo que se llevó
        render(<LogMealModal onClose={vi.fn()} onScan={onScan} initialMealType={d.mealType} initialDaysAgo={d.daysAgo} initialBorrador={d.borrador} />);
        expect(screen.getByRole('list', { name: 'Tu plato' })).toBeInTheDocument();
        expect(screen.getByLabelText('Cantidad de Arroz blanco')).toHaveValue('1.5');
    });

    it('con el plato vacío no viaja nada', async () => {
        const user = userEvent.setup();
        const onScan = vi.fn();
        render(<LogMealModal onClose={vi.fn()} onScan={onScan} />);
        await user.click(screen.getByRole('button', { name: 'Escanear con foto' }));
        expect(onScan.mock.calls[0][0].borrador).toBeNull();
    });
});

describe('[1152] registrar la foto con el plato a medias vuelve al plato', () => {
    const leer = (rel) => fs.readFileSync(rel, 'utf-8').replace(/\r\n/g, '\n');
    it('los tres padres reabren el componedor si el plato traía algo', () => {
        expect(leer('src/components/dashboard/TrackingProgress.jsx')).toContain('if (scanOpen?.borrador?.lines?.length) setLogOpen(scanOpen);');
        expect(leer('src/pages/Dashboard.jsx')).toContain('if (d?.borrador?.lines?.length) setLogMealOpen(d);');
        expect(leer('src/components/dashboard/DiaryHistory.jsx')).toContain('if (escaneando?.borrador?.lines?.length) setRegistrando(escaneando);');
    });
});
