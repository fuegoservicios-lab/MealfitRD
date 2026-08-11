// [P1-MANUAL-FOOD-LOG · 2026-08-11] El componedor de comidas y su buscador.
//
// Lo que se ancla, y por qué cada cosa:
//  1. El ranking ORDENA ANTES DE CORTAR — el bug real de P1-STAPLE-SEARCH-RANK: con
//     el corte primero, «pollo» podía quedarse fuera de su propia búsqueda si veinte
//     resultados peores llegaban antes por orden alfabético.
//  2. El POST manda REFERENCIAS, no macros (doctrina consumed-from-plan). Si un día
//     alguien manda kcal desde el cliente, el servidor dejaría de ser la autoridad.
//  3. `meal_type` por defecto = 'extra': registrar un sándwich de la calle NO puede
//     atenuar el almuerzo del plan ni bloquear swap/PDF (P1-EATEN-RECIPE-LOCK).
//  4. El interruptor de Nevera arranca APAGADO y viaja tal cual.
//  5. Carga de catálogo fallida ⇒ panel bloqueado con Reintentar, no un buscador
//     vacío que parece «sin resultados» (fail-closed, familia P2-SUPERPERS).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import LogMealModal from '../components/dashboard/LogMealModal';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import { _resetPantryCacheForTests, setCachedMasterList, setCachedDishes } from '../utils/pantryCache';
import { searchFoods } from '../utils/foodSearch';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const FOODS = [
    { id: '11', name: 'Arroz blanco', aliases: [], kcal_per_100g: 358.6, protein_g_per_100g: 7, carbs_g_per_100g: 80.3, fats_g_per_100g: 1,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g' }, { unit: 'taza', grams_per_qty: 185, label: 'taza', default: true }] },
    { id: '22', name: 'Repollo', aliases: [], kcal_per_100g: 25, protein_g_per_100g: 1, carbs_g_per_100g: 6, fats_g_per_100g: 0,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g', default: true }] },
    { id: '33', name: 'Pechuga de pollo', aliases: [], kcal_per_100g: 107, protein_g_per_100g: 22, carbs_g_per_100g: 0, fats_g_per_100g: 2,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g' }, { unit: 'unidad', grams_per_qty: 170, label: 'unidad', default: true }] },
    { id: '44', name: 'Guineo maduro', aliases: ['banano', 'platano maduro pequeno'], kcal_per_100g: 89, protein_g_per_100g: 1, carbs_g_per_100g: 23, fats_g_per_100g: 0,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g', default: true }] },
];

const DISHES = [
    { slug: 'moro', label: 'Moro de habichuelas', finished_g: 230, per_100g: { kcal: 172.5, protein: 5.3, carbs: 30.9, fats: 3.0 } },
    { slug: 'pollo guisado', label: 'Pollo guisado dominicano', finished_g: 165, per_100g: { kcal: 130, protein: 15, carbs: 3, fats: 6 } },
];

const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

describe('[P1-MANUAL-FOOD-LOG] el buscador (utils/foodSearch)', () => {
    it('ordena ANTES de cortar: «pollo» encabeza su propia búsqueda', () => {
        // Muchos resultados de rango peor no pueden expulsar al exacto/empieza-por.
        const relleno = Array.from({ length: 20 }, (_, i) => ({
            id: `r${i}`, name: `Arepollo ${String.fromCharCode(65 + i)}`, aliases: [], portions: [],
        }));
        const out = searchFoods('pollo', [...relleno, ...FOODS], DISHES, 5);
        expect(out.length).toBe(5);
        // El plato «Pollo guisado dominicano» (empieza-por, y plato gana el empate) y
        // «Pechuga de pollo» (palabra interior) tienen que sobrevivir al corte.
        const etiquetas = out.map((r) => r.label);
        expect(etiquetas).toContain('Pollo guisado dominicano');
        expect(etiquetas).toContain('Pechuga de pollo');
    });

    it('encuentra por alias curado («banano» → Guineo maduro)', () => {
        const out = searchFoods('banano', FOODS, [], 5);
        expect(out.map((r) => r.label)).toContain('Guineo maduro');
    });

    it('menos de 2 letras no busca (evita listas de 200 filas por una tecla)', () => {
        expect(searchFoods('p', FOODS, DISHES)).toEqual([]);
    });
});

describe('[P1-MANUAL-FOOD-LOG] el componedor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetPantryCacheForTests();
        setCachedMasterList(FOODS);
        setCachedDishes(DISHES);
        fetchWithAuth.mockImplementation(async (url) => {
            if (String(url).includes('/api/diary/foods/frequent')) return respuesta({ items: [] });
            return respuesta({ success: true, totals: { kcal: 397 }, lines: [] });
        });
    });

    it('buscar → añadir → registrar manda REFERENCIAS, no macros', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />);

        await user.type(screen.getByLabelText('Buscar alimento'), 'moro');
        await user.click(await screen.findByText('Moro de habichuelas'));

        expect(screen.getByText('Tu plato')).toBeInTheDocument();
        // Vista previa: 1 ración = 230 g → 172.5 × 2.3 ≈ 397 kcal.
        expect(screen.getByText(/230 g · 397 kcal/)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Registrar' }));

        await waitFor(() => {
            const post = fetchWithAuth.mock.calls.find(([u, o]) => String(u).includes('/consumed/manual') && o?.method === 'POST');
            expect(post, 'no salió el POST del componedor').toBeTruthy();
            const body = JSON.parse(post[1].body);
            expect(body.lines).toEqual([{ ref: 'dish:moro', qty: 1, unit: 'racion' }]);
            const claves = Object.keys(body.lines[0]);
            expect(claves).not.toContain('macros');
            expect(claves).not.toContain('kcal');
        });
    });

    it("meal_type por defecto es 'extra': no secuestra el plan", async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />);
        await user.type(screen.getByLabelText('Buscar alimento'), 'arroz');
        await user.click(await screen.findByText('Arroz blanco'));
        await user.click(screen.getByRole('button', { name: 'Registrar' }));
        await waitFor(() => {
            const post = fetchWithAuth.mock.calls.find(([u, o]) => String(u).includes('/consumed/manual') && o?.method === 'POST');
            expect(JSON.parse(post[1].body).meal_type).toBe('extra');
        });
    });

    it('el interruptor de Nevera arranca APAGADO y viaja tal cual', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />);
        await user.type(screen.getByLabelText('Buscar alimento'), 'arroz');
        await user.click(await screen.findByText('Arroz blanco'));

        const toggle = screen.getByRole('checkbox');
        expect(toggle).not.toBeChecked();

        await user.click(screen.getByRole('button', { name: 'Registrar' }));
        await waitFor(() => {
            const post = fetchWithAuth.mock.calls.find(([u, o]) => String(u).includes('/consumed/manual') && o?.method === 'POST');
            expect(JSON.parse(post[1].body).deduct_pantry).toBe(false);
        });
    });

    it('sin líneas, Registrar está deshabilitado: no hay comidas vacías', () => {
        render(<LogMealModal onClose={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled();
    });

    it('catálogo caído ⇒ bloqueo con Reintentar, no un buscador que miente', async () => {
        _resetPantryCacheForTests();
        fetchWithAuth.mockImplementation(async (url) => {
            if (String(url).includes('/api/diary/foods/frequent')) return respuesta({ items: [] });
            return respuesta({}, false, 500);
        });
        render(<LogMealModal onClose={vi.fn()} />);
        expect(await screen.findByText(/No pudimos cargar el catálogo/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Buscar alimento')).not.toBeInTheDocument();
    });

    it('un 422 del servidor se muestra y NO cierra el modal (nada quedó a medias)', async () => {
        const onClose = vi.fn();
        fetchWithAuth.mockImplementation(async (url, opts) => {
            if (String(url).includes('/foods/frequent')) return respuesta({ items: [] });
            if (opts?.method === 'POST') return respuesta({ detail: 'Línea irresoluble: plato desconocido' }, false, 422);
            return respuesta({ items: [] });
        });
        const user = userEvent.setup();
        render(<LogMealModal onClose={onClose} />);
        await user.type(screen.getByLabelText('Buscar alimento'), 'arroz');
        await user.click(await screen.findByText('Arroz blanco'));
        await user.click(screen.getByRole('button', { name: 'Registrar' }));
        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled();
        });
        expect(onClose).not.toHaveBeenCalled();
    });
});
