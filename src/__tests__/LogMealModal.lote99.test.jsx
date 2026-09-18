// [P1-PLAN-LOTE-99 · 2026-09-18] El componedor, rehecho para el teléfono (el dueño, con captura: «incómodo de
// interactuar y entender… un cambio radical»). Lo que este test defiende es lo que cambió de VERDAD para la mano:
//  · hoja inferior con cabecera y pie fijos y cuerpo desplazable (el botón no se pierde bajo el teclado);
//  · preguntas en vez de desplegables sin etiqueta: «¿Qué comiste?», «¿Qué comida es?», «¿Cuándo?», con chips;
//  · «Lo que más registras» es una lista vertical, no una fila con scroll horizontal;
//  · todo campo de texto a 1rem (iOS hace zoom por debajo de 16px);
//  · el pie dice por qué «Registrar» está apagado.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import LogMealModal from '../components/dashboard/LogMealModal';
import { fetchWithAuth } from '../config/api';
import { _resetPantryCacheForTests, setCachedMasterList, setCachedDishes } from '../utils/pantryCache';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const plano = (s) => s.split(/\s+/).join(' ');
const regla = (css, sel) => {
    const i = css.indexOf(`\n${sel} {`);
    expect(i, `falta ${sel}`).toBeGreaterThan(-1);
    return plano(css.slice(i, css.indexOf('}', i)));
};

const FOODS = [
    { id: '11', name: 'Arroz blanco', aliases: [], kcal_per_100g: 358.6, protein_g_per_100g: 7, carbs_g_per_100g: 80.3, fats_g_per_100g: 1,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g' }, { unit: 'taza', grams_per_qty: 185, label: 'taza', default: true }] },
];
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

describe('la hoja y sus tres zonas', () => {
    it('cabecera y pie fijos, cuerpo desplazable; hoja inferior en el teléfono y centrada en escritorio', () => {
        const css = src('src/components/dashboard/LogMealModal.module.css');
        expect(regla(css, '.panel')).toContain('display: flex; flex-direction: column;');
        expect(regla(css, '.panel')).toContain('max-height: 94dvh;');
        expect(regla(css, '.panel')).toContain('border-radius: 22px 22px 0 0;');
        expect(regla(css, '.overlay')).toContain('align-items: flex-end;');
        expect(regla(css, '.body')).toContain('flex: 1 1 auto; min-height: 0; overflow-y: auto;');
        expect(regla(css, '.footer')).toContain('flex: 0 0 auto;');
        expect(regla(css, '.footer')).toContain('env(safe-area-inset-bottom, 0px)');
        const escritorio = plano(css.slice(css.indexOf('@media (min-width: 641px) {')));
        expect(escritorio).toContain('.overlay { align-items: center; padding: 1rem; }');
        expect(escritorio).toContain('max-width: 600px;');
    });

    it('ningún campo de texto baja de 1rem (iOS haría zoom)', () => {
        const css = src('src/components/dashboard/LogMealModal.module.css');
        for (const sel of ['.search', '.lineQty', '.lineUnit', '.nameInput', '.macroInput']) {
            expect(regla(css, sel), sel).toContain('font-size: 1rem;');
        }
    });

    it('«Lo que más registras» es una lista vertical y las etiquetas del selector de vía no parten en dos', () => {
        const css = src('src/components/dashboard/LogMealModal.module.css');
        expect(css).not.toContain('overflow-x: auto');
        expect(regla(css, '.frequentList')).toContain('flex-direction: column;');
        expect(regla(css, '.mode > span')).toContain('white-space: nowrap;');
    });
});

describe('preguntas con chips en vez de desplegables sin etiqueta', () => {
    beforeEach(() => {
        _resetPantryCacheForTests();
        setCachedMasterList(FOODS);
        setCachedDishes([]);
        fetchWithAuth.mockReset();
        fetchWithAuth.mockImplementation(async () => respuesta({ items: [] }));
    });

    it('las tres preguntas están, «Extra» es el tipo por defecto y explica qué es; «Hoy» el día', () => {
        render(<LogMealModal onClose={vi.fn()} />);
        expect(screen.getByText('¿Qué comiste?')).toBeInTheDocument();
        expect(screen.getByText('¿Qué comida es?')).toBeInTheDocument();
        expect(screen.getByText('¿Cuándo?')).toBeInTheDocument();
        expect(screen.queryByRole('combobox')).toBeNull();
        expect(screen.getByRole('button', { name: 'Extra' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Extra: un antojo o picoteo fuera de tus comidas. Cuenta igual.')).toBeInTheDocument();
        // el pie dice por qué el botón está apagado
        expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled();
        expect(screen.getByText('Añade al menos un alimento para registrar.')).toBeInTheDocument();
    });

    it('un toque cambia el tipo y el día, y el registro los manda', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: 'Almuerzo' }));
        await user.click(screen.getByRole('button', { name: 'Ayer' }));
        expect(screen.queryByText('Extra: un antojo o picoteo fuera de tus comidas. Cuenta igual.')).toBeNull();
        await user.type(screen.getByLabelText('Buscar alimento'), 'arroz');
        await user.click(screen.getByText('Arroz blanco'));
        expect(screen.getByText('Tu plato')).toBeInTheDocument();
        expect(screen.getByText(/1 en tu plato/)).toBeInTheDocument();
        fetchWithAuth.mockImplementationOnce(async () => respuesta({ success: true, totals: { kcal: 663 } }));
        await user.click(screen.getByRole('button', { name: 'Registrar' }));
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledWith('/api/diary/consumed/manual', expect.anything()));
        const body = JSON.parse(fetchWithAuth.mock.calls.find((c) => c[0] === '/api/diary/consumed/manual')[1].body);
        expect(body.meal_type).toBe('almuerzo');
        expect(body.days_ago).toBe(1);
    });

    it('«Comí otra cosa» abre en el slot del plato (initialMealType) y no en Extra', () => {
        render(<LogMealModal onClose={vi.fn()} initialMealType="cena" />);
        expect(screen.getByRole('button', { name: 'Cena' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Extra' })).toHaveAttribute('aria-pressed', 'false');
    });
});
