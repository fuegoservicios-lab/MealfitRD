// [P1-STAPLE-FOODS · 2026-08-02] Panel de Ajustes "Mis básicos". Cubre:
//   1. Carga inicial (GET) pinta los básicos guardados.
//   2. Agregar vía búsqueda + Guardar hace PUT con el array actualizado y sincroniza formData
//      (updateData) — mismo contrato que SuperPersonalizationPanel.
//   3. Quitar un básico + Guardar hace PUT sin ese ítem.
//   4. Fail-closed: una carga fallida bloquea "Guardar" (nunca pisa datos reales con []).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import StapleFoodsPanel from '../components/settings/StapleFoodsPanel';
import { fetchWithAuth } from '../config/api';
import { _resetPantryCacheForTests, setCachedMasterList } from '../utils/pantryCache';

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

const CATALOG = [
    { id: 'p1', name: 'Pollo' },
    { id: 'h1', name: 'Huevos' },
];

const jsonResponse = (body, ok = true, status = 200) => ({
    ok, status,
    json: async () => body,
});

describe('StapleFoodsPanel — Ajustes (P1-STAPLE-FOODS)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetPantryCacheForTests();
        setCachedMasterList(CATALOG);
    });

    it('carga y pinta los básicos guardados (GET)', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === '/api/user/preferences/staple-foods') {
                return jsonResponse({ staple_foods: ['Pollo'] });
            }
            return jsonResponse({ items: CATALOG });
        });
        render(<StapleFoodsPanel />, { customContext: { updateData: vi.fn() } });
        expect(await screen.findByText('Pollo')).toBeInTheDocument();
        expect(screen.getByText('1/8')).toBeInTheDocument();
    });

    it('agregar un básico SE GUARDA SOLO y sincroniza formData', async () => {
        const updateData = vi.fn();
        fetchWithAuth.mockImplementation(async (url, opts) => {
            if (url === '/api/user/preferences/staple-foods' && (!opts || opts.method === undefined)) {
                return jsonResponse({ staple_foods: [] });
            }
            if (url === '/api/user/preferences/staple-foods' && opts?.method === 'PUT') {
                const body = JSON.parse(opts.body);
                return jsonResponse({ staple_foods: body.staple_foods });
            }
            return jsonResponse({ items: CATALOG });
        });
        const user = userEvent.setup();
        render(<StapleFoodsPanel />, { customContext: { updateData } });

        await waitFor(() => expect(screen.getByText('Aún no has elegido ningún básico.')).toBeInTheDocument());

        const input = screen.getByPlaceholderText(/Busca un alimento del catálogo/i);
        await user.type(input, 'poll');
        const option = await screen.findByRole('option', { name: 'Pollo' });
        await user.click(option);
        expect(await screen.findByText('Pollo')).toBeInTheDocument();

        // [P1-SETTINGS-AUTOSAVE · 2026-08-11] Ya no hay botón que pulsar: el panel se
        // guarda solo 400 ms después del clic (clase «instantánea» — un chip es un
        // UPDATE barato, a diferencia del texto libre, que cuesta una llamada al modelo).
        await waitFor(() => {
            const putCall = fetchWithAuth.mock.calls.find(
                (c) => c[0] === '/api/user/preferences/staple-foods' && c[1]?.method === 'PUT'
            );
            expect(putCall, 'no salió ningún PUT: el autoguardado no disparó').toBeTruthy();
            expect(JSON.parse(putCall[1].body)).toEqual({ staple_foods: ['Pollo'] });
        }, { timeout: 3000 });
        await waitFor(() => expect(updateData).toHaveBeenCalledWith('stapleFoods', ['Pollo']));
    });

    it('quitar un básico se guarda solo, sin ese ítem', async () => {
        fetchWithAuth.mockImplementation(async (url, opts) => {
            if (url === '/api/user/preferences/staple-foods' && opts?.method === 'PUT') {
                const body = JSON.parse(opts.body);
                return jsonResponse({ staple_foods: body.staple_foods });
            }
            if (url === '/api/user/preferences/staple-foods') {
                return jsonResponse({ staple_foods: ['Pollo', 'Huevos'] });
            }
            return jsonResponse({ items: CATALOG });
        });
        const user = userEvent.setup();
        render(<StapleFoodsPanel />, { customContext: { updateData: vi.fn() } });

        await screen.findByText('Pollo');
        await user.click(screen.getByRole('button', { name: /Quitar Pollo de tus básicos/i }));

        await waitFor(() => {
            const putCall = fetchWithAuth.mock.calls.find(
                (c) => c[0] === '/api/user/preferences/staple-foods' && c[1]?.method === 'PUT'
            );
            expect(putCall, 'quitar un básico no llegó a guardarse').toBeTruthy();
            expect(JSON.parse(putCall[1].body)).toEqual({ staple_foods: ['Huevos'] });
        }, { timeout: 3000 });
    });

    it('fail-closed: carga fallida bloquea Guardar (nunca pisa con vacío)', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (url === '/api/user/preferences/staple-foods') {
                return jsonResponse({}, false, 500);
            }
            return jsonResponse({ items: CATALOG });
        });
        render(<StapleFoodsPanel />, { customContext: { updateData: vi.fn() } });

        // 1 reintento automático a los 800ms antes de fail-closed.
        const retryBtn = await screen.findByRole('button', { name: /Reintentar/i }, { timeout: 3000 });
        expect(retryBtn).toBeInTheDocument();

        // [P1-SETTINGS-AUTOSAVE · 2026-08-11] Aquí había un
        // `queryByRole('button', {name: /Guardar básicos/i})).not.toBeInTheDocument()`.
        // Al quitar el botón esa aserción pasó a ser CIERTA POR VACÍO: no puede fallar,
        // y una guarda que no puede fallar se ve exactamente igual que una sana.
        // Se sustituye por lo que de verdad protege el dato — que no salga ni una
        // escritura—, que además es la afirmación correcta ahora que quien dispara es
        // un temporizador y no un dedo.
        await new Promise((r) => { setTimeout(r, 900); });
        const escrituras = fetchWithAuth.mock.calls.filter(([, o]) => o?.method === 'PUT');
        expect(escrituras, `salieron ${escrituras.length} escrituras con la carga caída`).toEqual([]);
    });
});
