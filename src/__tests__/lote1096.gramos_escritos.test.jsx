// [P1-PLAN-LOTE-1096 · 2026-11-18] «Quiero que se pueda editar cualquier cantidad»: la cifra de gramos se toca y se
// escribe, y el paso del −/+ va según el tamaño (10 g de aceite son 90 kcal).
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
            { texto: `pechuga de pollo a la plancha (≈${gramosPollo} g)`, ajustable_g: gramosPollo, kcal: 130 },
            { texto: 'Aceite de oliva (≈5 g)', ajustable_g: 5, kcal: 45 },
        ] },
    },
});

beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });
afterEach(() => { vi.clearAllMocks(); });

describe('[1096] gramos que se escriben', () => {
    it('tocar la cifra abre el campo; al confirmar manda ESOS gramos', async () => {
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce(respuesta(ficha(78, 120)))
            .mockResolvedValueOnce(respuesta(ficha(90, 175)));
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: /Escribir los gramos de pechuga/i }));
        const campo = screen.getByRole('spinbutton', { name: /Gramos de pechuga/i });
        fireEvent.change(campo, { target: { value: '175' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        fireEvent.blur(campo);
        await screen.findByText('175 g');
        const [url, opciones] = vi.mocked(fetchWithAuth).mock.calls[1];
        expect(url).toBe(`/api/diary/consumed/${MEAL.id}/gramos`);
        expect(JSON.parse(opciones.body)).toEqual({ indice: 0, gramos: 175 });
    });

    it('Escape o la misma cifra no mandan nada', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValueOnce(respuesta(ficha(78, 120)));
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: /Escribir los gramos de pechuga/i }));
        fireEvent.blur(screen.getByRole('spinbutton', { name: /Gramos de pechuga/i }));
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('el paso va según el tamaño: el aceite de 5 g sube de 1 en 1 y no baja del mínimo', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValueOnce(respuesta(ficha(78, 120)));
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        expect(await screen.findByRole('button', { name: 'Añadir 1 g' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Quitar 1 g' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Añadir 10 g' })).toBeEnabled();
    });
});
