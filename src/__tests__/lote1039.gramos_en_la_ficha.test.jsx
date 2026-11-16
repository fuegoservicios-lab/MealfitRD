// [P1-PLAN-LOTE-1039 · A-41 · 2026-11-16] Los gramos de cada pieza se ajustan en la ficha de la comida.
//
// Caso real: dos cenas con la misma pechuga y el mismo bistec; la foto no sabe cuánto pesaba cada pieza. El −/+ manda
// los gramos NUEVOS de esa pieza y pinta los totales que devuelve el servidor (que los calcula con el catálogo, sin IA).
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
        ingredientes: { con_kcal: false, lineas: [
            { texto: `pechuga de pollo a la plancha (≈${gramosPollo} g)`, ajustable_g: gramosPollo },
            { texto: 'ensalada de papa y zanahoria con mayonesa (≈1 taza, 200 g)' },
        ] },
    },
});

beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });
afterEach(() => { vi.clearAllMocks(); });

describe('[P1-PLAN-LOTE-1039] gramos ajustables en la ficha', () => {
    it('solo la pieza ajustable lleva −/+ y su peso', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(respuesta(ficha(78, 120)));
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        expect(await screen.findByText('120 g')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Añadir 10 g' })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Quitar 10 g' })).toHaveLength(1);
    });

    it('«+» manda los gramos nuevos de ESA pieza y pinta los totales del servidor', async () => {
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce(respuesta(ficha(78, 120)))
            .mockResolvedValueOnce(respuesta(ficha(81, 130)));
        const avisos = vi.fn();
        window.addEventListener('mealfit:refresh-inventory', avisos);
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Añadir 10 g' }));
        await screen.findByText('130 g');
        const [url, opciones] = vi.mocked(fetchWithAuth).mock.calls[1];
        expect(url).toBe(`/api/diary/consumed/${MEAL.id}/gramos`);
        expect(JSON.parse(opciones.body)).toEqual({ indice: 0, gramos: 130 });
        expect(screen.getByText('81 g')).toBeInTheDocument();          // la proteína de la cabecera
        expect(avisos).toHaveBeenCalled();                              // la tarjeta del día se vuelve a pedir
        window.removeEventListener('mealfit:refresh-inventory', avisos);
    });

    it('si el servidor no puede, avisa y deja todo como estaba', async () => {
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce(respuesta(ficha(78, 120)))
            .mockResolvedValueOnce(respuesta({ detail: 'x' }, false, 409));
        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Quitar 10 g' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo ajustar la cantidad.'));
        expect(screen.getByText('120 g')).toBeInTheDocument();
        expect(screen.getByText('78 g')).toBeInTheDocument();
    });
});
