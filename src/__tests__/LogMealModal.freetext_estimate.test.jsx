// [P1-DIARY-FREETEXT-ESTIMATE · 2026-09-04] «Escríbelo y estimamos las macros» + «Foto» desde el
// componedor. Lo que el catálogo no conoce ya se podía añadir, pero SOLO tecleando las cuatro
// macros; ahora un botón pide la estimación al backend (flash) y vuelve como borrador EDITABLE
// marcado como estimado. La foto reutiliza el escáner que ya existe (el padre lo abre).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import LogMealModal from '../components/dashboard/LogMealModal';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import { _resetPantryCacheForTests, setCachedMasterList, setCachedDishes } from '../utils/pantryCache';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const FOODS = [
    { id: '11', name: 'Arroz blanco', aliases: [], kcal_per_100g: 358.6, protein_g_per_100g: 7, carbs_g_per_100g: 80.3, fats_g_per_100g: 1,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g', default: true }] },
];
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

beforeEach(() => {
    _resetPantryCacheForTests();
    setCachedMasterList(FOODS);
    setCachedDishes([]);
    fetchWithAuth.mockReset();
    toast.error.mockReset();
});

describe('estimar macros de un texto libre', () => {
    it('el borrador «con macros propias» ofrece estimar; la respuesta rellena las macros como estimación editable', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (String(url).includes('/api/diary/consumed/estimate-macros')) {
                return respuesta({ name: 'Mangú con huevo frito', macros: { kcal: 520, protein: 18, carbs: 70, fats: 18 }, portion_note: '1 plato (~350 g)', estimated: true, model: 'glm-x' });
            }
            return respuesta([]);
        });
        const user = userEvent.setup();
        render(<LogMealModal onClose={() => {}} />);
        await user.type(screen.getByLabelText('Buscar alimento'), 'mangú con huevo frito');
        await user.click(screen.getByText('Añadir «mangú con huevo frito» con macros propias'));
        const btn = screen.getByText('Estimar macros por mí');
        await user.click(btn);
        await waitFor(() => expect(screen.getByLabelText(/^Calorías/)).toHaveValue(520));
        const llamada = fetchWithAuth.mock.calls.find(([u]) => String(u).includes('estimate-macros'));
        expect(JSON.parse(llamada[1].body)).toEqual({ text: 'mangú con huevo frito', meal_type: expect.any(String) });
        expect(screen.getByRole('status').textContent).toContain('Estimación aproximada (1 plato (~350 g)); ajústala si sabes más.');
        expect(screen.getByLabelText(/^Proteína/)).toHaveValue(18);
        // sigue siendo editable: la estimación es un borrador, no una decisión
        await user.clear(screen.getByLabelText(/^Calorías/));
        await user.type(screen.getByLabelText(/^Calorías/), '600');
        await user.click(screen.getByText('Añadir al plato'));
        expect(screen.getByText('Mangú con huevo frito')).toBeTruthy();
        expect(screen.getByText('600 kcal · estimado')).toBeTruthy();
    });

    it('si el backend no puede (soft-fail), avisa y deja las macros a mano', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (String(url).includes('estimate-macros')) {
                return respuesta({ operation_failed: true, error_code: 'estimate_unavailable', error_message: 'No pudimos estimar las macros ahora; escríbelas tú o inténtalo de nuevo.' });
            }
            return respuesta([]);
        });
        const user = userEvent.setup();
        render(<LogMealModal onClose={() => {}} />);
        await user.type(screen.getByLabelText('Buscar alimento'), 'pica pollo');
        await user.click(screen.getByText('Añadir «pica pollo» con macros propias'));
        await user.click(screen.getByText('Estimar macros por mí'));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No pudimos estimar las macros ahora; escríbelas tú o inténtalo de nuevo.'));
        expect(screen.getByLabelText(/^Calorías/)).toHaveValue(0);
        expect(screen.queryByRole('status')).toBeNull();
    });
});

describe('foto desde el componedor', () => {
    it('con onScan aparece «Foto» y lo llama; sin onScan no hay botón', async () => {
        fetchWithAuth.mockImplementation(async () => respuesta([]));
        const user = userEvent.setup();
        const onScan = vi.fn();
        const { unmount } = render(<LogMealModal onClose={() => {}} onScan={onScan} />);
        await user.click(screen.getByLabelText('Escanear con foto'));
        expect(onScan).toHaveBeenCalledTimes(1);
        unmount();
        render(<LogMealModal onClose={() => {}} />);
        expect(screen.queryByLabelText('Escanear con foto')).toBeNull();
    });

    it('los dos padres lo cablean: TrackingProgress cierra el componedor y abre su escáner; Dashboard monta el escáner al pedirlo', () => {
        const tp = src('src/components/dashboard/TrackingProgress.jsx');
        expect(tp).toContain('const handleLogToScan = useCallback(() => { setLogOpen(false); setScanOpen(true); }, []);');
        expect(tp).toContain('<LogMealModal onClose={handleLogClose} onScan={handleLogToScan} />');
        const dash = src('src/pages/Dashboard.jsx');
        expect(dash).toContain("onScan={() => { setLogMealOpen(false); setScanMealOpen(true); }}");
        expect(dash).toContain('{scanMealOpen && <ScanMealModal isOpen={scanMealOpen} onClose={() => setScanMealOpen(false)}');
    });
});
