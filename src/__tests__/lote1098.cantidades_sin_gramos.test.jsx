// [P1-PLAN-LOTE-1098 · 2026-11-18] La cantidad de un renglón SIN gramos («1 taza», «2 unidad») también se corrige:
// tazas y cucharadas de media en media, lo demás de una en una, y la cifra se toca para escribirla.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('../hooks/useFotosDeComidas', () => ({
    useFotoDeComida: vi.fn(() => null), useFotosDeComida: vi.fn(() => []),
    useIdsConFoto: vi.fn(() => new Set()), useEnlazarFotosDelChat: vi.fn(),
    borrarFotoDeComidaEnSegundoPlano: vi.fn(),
}));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: vi.fn(() => ({ planData: null })) }));

import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import FichaDeComida from '../components/dashboard/FichaDeComida';

const UID = '11111111-1111-1111-1111-111111111111';
const MEAL = {
    id: '8a2b1c3d-1111-4222-8333-944455556666', meal_name: 'Cena', meal_type: 'cena',
    calories: 1250, protein: 78, carbs: 99, healthy_fats: 59,
    consumed_at: new Date().toISOString(), created_at: new Date().toISOString(), micros: null,
};
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const ficha = (protein, gramosPollo) => ({
    success: true,
    meal: {
        id: MEAL.id, source: 'chat', plan_ref: null, created_at: MEAL.created_at,
        calories: 1250 + 4 * (protein - 78), protein, carbs: 99, healthy_fats: 59,
        ingredientes: { con_kcal: true, lineas: [
            { texto: `${gramosPollo} taza de arroz blanco`, cantidad: { valor: gramosPollo, unidad: 'taza' }, kcal: 205 },
            { texto: '2 unidad de huevo hervido', cantidad: { valor: 2, unidad: 'unidad' }, kcal: 139 },
            { texto: 'Café negro' },
        ] },
    },
});

beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });
afterEach(() => { vi.clearAllMocks(); });

describe('[1098] cantidades sin gramos', () => {
    it('las tazas suben de media en media y mandan la CANTIDAD nueva', async () => {
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce(respuesta(ficha(78, 1)))
            .mockResolvedValueOnce(respuesta(ficha(80, 1.5)));
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        expect(await screen.findByText('1 taza')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Añadir 0.5 taza' }));
        await screen.findByText('1.5 taza');
        expect(JSON.parse(vi.mocked(fetchWithAuth).mock.calls[1][1].body)).toEqual({ indice: 0, cantidad: 1.5 });
    });

    it('las unidades van de una en una y no bajan de un cuarto', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValueOnce(respuesta(ficha(78, 1)));
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        expect(await screen.findByRole('button', { name: 'Añadir 1 unidad' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Quitar 1 unidad' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Quitar 0.5 taza' })).toBeEnabled();
    });

    it('se escribe: «1,25» manda 1.25', async () => {
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce(respuesta(ficha(78, 1)))
            .mockResolvedValueOnce(respuesta(ficha(79, 1.25)));
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: /Escribir la cantidad de .*arroz/i }));
        const campo = screen.getByRole('spinbutton', { name: /Cantidad de .*arroz/i });
        fireEvent.change(campo, { target: { value: '1.25' } });
        fireEvent.blur(campo);
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(2));
        expect(JSON.parse(vi.mocked(fetchWithAuth).mock.calls[1][1].body)).toEqual({ indice: 0, cantidad: 1.25 });
    });

    it('lo que no tiene cantidad (café) no lleva −/+', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValueOnce(respuesta(ficha(78, 1)));
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        await screen.findByText('1 taza');
        expect(screen.getAllByRole('button', { name: /^Añadir/ })).toHaveLength(2);
    });
});
