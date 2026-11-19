// [P1-UNIDADES-FLEXIBLES · 2026-11-18] Selector flexible de unidades en FichaDeComida.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('../hooks/useFotosDeComidas', () => ({
    useFotoDeComida: vi.fn(() => null), useFotosDeComida: vi.fn(() => []),
    useIdsConFoto: vi.fn(() => new Set()), useEnlazarFotosDelChat: vi.fn(),
    borrarFotoDeComidaEnSegundoPlano: vi.fn(),
}));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: vi.fn(() => ({ planData: null })) }));

import { fetchWithAuth } from '../config/api';
import FichaDeComida from '../components/dashboard/FichaDeComida';

const UID = '11111111-1111-1111-1111-111111111111';
const MEAL = {
    id: '8a2b1c3d-1111-4222-8333-944455556666', meal_name: 'Desayuno', meal_type: 'desayuno',
    calories: 914, protein: 50, carbs: 80, healthy_fats: 40,
    consumed_at: new Date().toISOString(), created_at: new Date().toISOString(), micros: null,
};
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const ficha = (gHuevo = 100, udsHuevo = 2, gAceite = 5, gMangu = 250) => ({
    success: true,
    meal: {
        id: MEAL.id, source: 'chat', plan_ref: null, created_at: MEAL.created_at,
        calories: 914, protein: 50, carbs: 80, healthy_fats: 40,
        ingredientes: {
            con_kcal: true,
            lineas: [
                { texto: `Huevos enteros (≈${gHuevo} g; ${udsHuevo} unidades)`, ajustable_g: gHuevo, kcal: 139 },
                { texto: `Aceite de oliva (≈${gAceite} g)`, ajustable_g: gAceite, kcal: 45 },
                { texto: `Mangú de plátano verde (≈${gMangu} g)`, ajustable_g: gMangu, kcal: 381 },
            ],
        },
    },
});

beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });
afterEach(() => { vi.clearAllMocks(); });

describe('[P1-UNIDADES-FLEXIBLES] editar ingredientes en unidades naturales', () => {
    it('arranca en uds cuando el renglón ya trae unidad natural (Huevos: 2 uds) y sube a 3 uds = 150 g', async () => {
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce(respuesta(ficha(100, 2, 5, 250)))
            .mockResolvedValueOnce(respuesta(ficha(150, 3, 5, 250)));

        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        expect(await screen.findByText('2 uds')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Añadir 1 uds' }));
        await screen.findByText('3 uds');

        const [url, opciones] = vi.mocked(fetchWithAuth).mock.calls[1];
        expect(url).toBe(`/api/diary/consumed/${MEAL.id}/gramos`);
        expect(JSON.parse(opciones.body)).toEqual({ indice: 0, gramos: 150 });
    });

    it('tocar la cifra abre el editor unificado: cambia Aceite de oliva a cdta, sube +0.5 cdta y guarda (5 g → 8 g)', async () => {
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce(respuesta(ficha(100, 2, 5, 250)))
            .mockResolvedValueOnce(respuesta(ficha(100, 2, 8, 250)));

        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        await screen.findByText('5 g');
        // Sin botón extra de unidad junto a cada fila
        expect(screen.queryByRole('button', { name: /Cambiar unidad/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Escribir los gramos de Aceite de oliva/i }));
        // No abre el teclado virtual al abrir el editor (el <input> no toma foco automático)
        expect(screen.getByRole('spinbutton', { name: /Gramos de Aceite de oliva/i })).not.toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'cdta' }));
        fireEvent.click(screen.getByRole('button', { name: '1.5 cdta' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

        await screen.findByText('1.5 cdta');
        expect(JSON.parse(vi.mocked(fetchWithAuth).mock.calls[1][1].body)).toEqual({ indice: 1, gramos: 8 });
    });

    it('en el editor unificado permite pasar Mangú a porción (1.5× = 375 g) con vista previa en vivo', async () => {
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce(respuesta(ficha(100, 2, 5, 250)))
            .mockResolvedValueOnce(respuesta(ficha(100, 2, 5, 375)));

        render(<FichaDeComida meal={MEAL} userId={UID} onClose={vi.fn()} />);
        await screen.findByText('250 g');

        fireEvent.click(screen.getByRole('button', { name: /Escribir los gramos de Mangú/i }));
        fireEvent.click(screen.getByRole('button', { name: 'porción' }));
        fireEvent.click(screen.getByRole('button', { name: '1.5×' }));
        // Vista previa en vivo antes de guardar: ≈ 375 g y 572 kcal
        expect(screen.getByText('≈ 375 g')).toBeInTheDocument();
        expect(screen.getByText('572 kcal')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await screen.findByText('1.5×');
        expect(JSON.parse(vi.mocked(fetchWithAuth).mock.calls[1][1].body)).toEqual({ indice: 2, gramos: 375 });
    });
});
