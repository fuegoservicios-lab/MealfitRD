/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] «Mis básicos» en Configuración.
 *
 *   · Quitar un básico no podaba su ANCLA del asistente (`formData.stapleAnchors`), y el backend AÑADE a los básicos el
 *     nombre de cada ancla (`plan_policy.compile_requested`): el básico quitado volvía al plan.
 *   · Adoptar el eco del servidor con `setStaples(saved)` pisaba el chip añadido mientras el PUT viajaba.
 *   · Al cargar no se refrescaban las copias de formData (`stapleFoods` Y `staple_foods`): la renovación del plan
 *     devolvía al servidor una lista vieja.
 *   · La búsqueda no ordenaba por relevancia (P1-STAPLE-SEARCH-RANK del asistente): «hu» sacaba las habichuelas antes
 *     que el huevo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import StapleFoodsPanel from '../components/settings/StapleFoodsPanel';
import { fetchWithAuth } from '../config/api';
import { _resetPantryCacheForTests, setCachedMasterList } from '../utils/pantryCache';

const sesion = { valor: null };
vi.mock('../utils/firstPartySession', () => ({ getStoredMfSession: () => sesion.valor }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(), api: (p) => `https://api.prueba${p}` }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ENDPOINT = '/api/user/preferences/staple-foods';
const CATALOG = [
    { id: 'a1', name: 'Arroz blanco' },
    { id: 'c1', name: 'Clara de huevo' },
    { id: 'h0', name: 'Habichuelas rojas' },
    { id: 'h1', name: 'Huevos' },
    { id: 'l1', name: 'Lechuga' },
    { id: 'p1', name: 'Pollo' },
];
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const ESPERA = { timeout: 3000 };

function servidor(guardados, { retenerPrimerPut = false } = {}) {
    const puts = [];
    let soltar = null;
    fetchWithAuth.mockImplementation(async (url, opts) => {
        if (url === ENDPOINT && opts?.method === 'PUT') {
            const body = JSON.parse(opts.body);
            puts.push(body.staple_foods);
            if (retenerPrimerPut && puts.length === 1) {
                return new Promise((r) => { soltar = () => r(respuesta({ staple_foods: body.staple_foods })); });
            }
            return respuesta({ staple_foods: body.staple_foods });
        }
        if (url === ENDPOINT) return respuesta({ staple_foods: guardados });
        return respuesta({ items: CATALOG });
    });
    return { puts, soltar: () => soltar && soltar() };
}

beforeEach(() => {
    vi.clearAllMocks();
    _resetPantryCacheForTests();
    setCachedMasterList(CATALOG);
});

describe('[718] quitar un básico poda su ancla', () => {
    it('igual que el asistente: sin ancla huérfana que el backend convierta otra vez en básico', async () => {
        servidor(['Pollo', 'Huevos']);
        const updateData = vi.fn();
        const anclas = [
            { name: 'Pollo', slots: ['almuerzo'], min_per_7d: 3, max_per_7d: 5 },
            { name: 'Huevos', slots: ['desayuno'] },
        ];
        const user = userEvent.setup();
        render(<StapleFoodsPanel />, {
            customContext: { updateData, formData: { stapleFoods: ['Pollo', 'Huevos'], staple_foods: ['Pollo', 'Huevos'], stapleAnchors: anclas } },
        });
        await screen.findByText('Pollo');
        await user.click(screen.getByRole('button', { name: /Quitar Pollo de tus básicos/i }));
        expect(updateData, 'el ancla de Pollo sobrevivió en formData').toHaveBeenCalledWith('stapleAnchors', [anclas[1]]);
    });
});

describe('[718] al cargar, formData queda al día con el servidor', () => {
    it('las DOS copias (`stapleFoods` y `staple_foods`) y las anclas de lo que ya no está', async () => {
        servidor(['Pollo']);
        const updateData = vi.fn();
        const anclas = [{ name: 'Pollo' }, { name: 'Arroz blanco' }];
        render(<StapleFoodsPanel />, {
            customContext: { updateData, formData: { stapleFoods: ['Pollo', 'Arroz blanco'], staple_foods: ['Pollo', 'Arroz blanco'], stapleAnchors: anclas } },
        });
        await screen.findByText('Pollo');
        expect(updateData).toHaveBeenCalledWith('stapleFoods', ['Pollo']);
        expect(updateData).toHaveBeenCalledWith('staple_foods', ['Pollo']);
        expect(updateData).toHaveBeenCalledWith('stapleAnchors', [{ name: 'Pollo' }]);
    });

    it('si ya coinciden, no las toca', async () => {
        servidor(['Pollo']);
        const updateData = vi.fn();
        render(<StapleFoodsPanel />, {
            customContext: { updateData, formData: { stapleFoods: ['Pollo'], staple_foods: ['Pollo'], stapleAnchors: [] } },
        });
        await screen.findByText('Pollo');
        expect(updateData).not.toHaveBeenCalled();
    });
});

describe('[718] el eco del servidor no pisa lo añadido mientras el PUT viajaba', () => {
    it('el chip añadido durante el guardado se queda, y sale en el PUT siguiente', async () => {
        const srv = servidor(['Pollo'], { retenerPrimerPut: true });
        const user = userEvent.setup();
        render(<StapleFoodsPanel />, { customContext: { updateData: vi.fn(), formData: {} } });
        await screen.findByText('Pollo');

        const buscador = screen.getByPlaceholderText(/Busca un alimento del catálogo/i);
        await user.type(buscador, 'huev');
        await user.click(await screen.findByRole('option', { name: 'Huevos' }));
        await waitFor(() => expect(srv.puts).toHaveLength(1), ESPERA);   // [Pollo, Huevos] en vuelo

        await user.type(buscador, 'arro');
        await user.click(await screen.findByRole('option', { name: 'Arroz blanco' }));
        expect(screen.getByText('Arroz blanco')).toBeInTheDocument();

        await act(async () => { srv.soltar(); });
        expect(screen.getByText('Arroz blanco'), 'el eco del primer PUT pisó el chip añadido mientras viajaba').toBeInTheDocument();
        await waitFor(() => expect(srv.puts).toHaveLength(2), ESPERA);
        expect(srv.puts[1]).toEqual(['Pollo', 'Huevos', 'Arroz blanco']);
    });
});

describe('[718] la búsqueda ordena por relevancia (P1-STAPLE-SEARCH-RANK)', () => {
    it('«hu»: primero lo que EMPIEZA por hu, luego la palabra interior, luego lo que solo lo contiene', async () => {
        servidor([]);
        const user = userEvent.setup();
        render(<StapleFoodsPanel />, { customContext: { updateData: vi.fn(), formData: {} } });
        await screen.findByText('Aún no has elegido ningún básico.');
        await user.type(screen.getByPlaceholderText(/Busca un alimento del catálogo/i), 'hu');
        const opciones = (await screen.findAllByRole('option')).map((o) => o.textContent);
        expect(opciones[0]).toBe('Huevos');
        expect(opciones[1]).toBe('Clara de huevo');
        expect(opciones.slice(2)).toEqual(['Habichuelas rojas', 'Lechuga']);
    });
});

describe('[718] la despedida (pagehide) sale en el mismo tic', () => {
    let fetchGlobal;
    beforeEach(() => {
        fetchGlobal = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ staple_foods: [] }) }));
        vi.stubGlobal('fetch', fetchGlobal);
    });
    afterEach(() => { vi.unstubAllGlobals(); sesion.valor = null; });

    it('con un cambio pendiente, `pagehide` lanza el PUT síncrono con keepalive y la sesión propia', async () => {
        sesion.valor = 'sesion-propia';
        servidor(['Pollo']);
        const user = userEvent.setup();
        render(<StapleFoodsPanel />, { customContext: { updateData: vi.fn(), formData: {} } });
        await screen.findByText('Pollo');
        await user.click(screen.getByRole('button', { name: /Quitar Pollo de tus básicos/i }));

        // Antes de que venza el temporizador de 400 ms, la página se va.
        act(() => { window.dispatchEvent(new Event('pagehide')); });
        expect(fetchGlobal, 'el PUT de la despedida no salió en el mismo tic').toHaveBeenCalledTimes(1);
        const [url, init] = fetchGlobal.mock.calls[0];
        expect(url).toBe(`https://api.prueba${ENDPOINT}`);
        expect(init.keepalive).toBe(true);
        expect(init.headers.get('X-MF-Session')).toBe('sesion-propia');
        expect(JSON.parse(init.body)).toEqual({ staple_foods: [] });
    });
});

describe('[718] accesibilidad', () => {
    it('«Mis básicos» es el nombre del grupo (buscador + chips), no un <label> suelto', async () => {
        servidor(['Pollo']);
        render(<StapleFoodsPanel />, { customContext: { updateData: vi.fn(), formData: {} } });
        expect(await screen.findByRole('group', { name: 'Mis básicos' })).toBeInTheDocument();
    });
});
