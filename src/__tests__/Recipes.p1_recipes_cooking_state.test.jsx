/**
 * [P1-RECIPES-COOKING-STATE · 2026-08-21] «El apartado de recetas también debería
 * tener la animación de cuando están cargando los platos».
 *
 * Recetas mostraba un único vacío estático («Aún no hay recetas para este día ·
 * Cuando tu plan esté completo…») aunque el servidor estuviera COCINANDO el
 * bloque en ese mismo momento — el Dashboard ya distingue pausado / cocinando /
 * programado desde P1-DASH-GENERATING-HONESTY, y esta página nunca lo heredó.
 *
 * La escalera replica las MISMAS condiciones y REUTILIZA las claves ya
 * traducidas del Dashboard (cero claves nuevas de catálogo). La paridad de
 * condiciones la ancla el test backend test_p1_recipes_cooking_state.py — aquí
 * se prueba la CONDUCTA.
 *
 * El fetch de /chunk-status va gateado por estado ACTIVO del plan (partial /
 * generating / generating_next / rolling / complete_partial): los planes de los
 * harnesses hermanos (eaten_slot, etc.) no traen generation_status y no deben
 * disparar la llamada — su mock de config/api ni siquiera define
 * getPlanChunkStatus.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import Recipes from '../pages/Recipes';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: vi.fn(() => vi.fn()) };
});

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
    getPlanChunkStatus: vi.fn(),
}));

import { getPlanChunkStatus } from '../config/api';

const _todayIso = () => new Date().toISOString();

function _planVacio(status = 'partial') {
    return {
        id: 'plan-1',
        calories: 2000,
        macros: { protein: 150, carbs: 200, fats: 60 },
        grocery_start_date: _todayIso(),
        created_at: _todayIso(),
        duration: 'weekly',
        generation_status: status,
        days: [{ day: 1, meals: [] }],
    };
}

const _chunkResponse = (body) => ({ ok: true, json: async () => body });

const _ctx = { userProfile: { id: 'test-user' } };

beforeEach(() => {
    vi.mocked(getPlanChunkStatus).mockReset();
});

describe('[P1-RECIPES-COOKING-STATE] el vacío de Recetas hereda la honestidad del Dashboard', () => {
    it('con trabajo corriendo AHORA → «Estamos cocinando» con animación live', async () => {
        vi.mocked(getPlanChunkStatus).mockResolvedValue(_chunkResponse({
            running_now_count: 1, scheduled_count: 2, pending_user_action_count: 0, in_flight_count: 3,
        }));
        render(<Recipes />, { customContext: { ..._ctx, planData: _planVacio() } });
        expect(await screen.findByText('Estamos cocinando estos días')).toBeInTheDocument();
        expect(screen.queryByText('Aún no hay recetas para este día')).not.toBeInTheDocument();
    });

    it('pausado gana a cocinando (misma precedencia que el Dashboard)', async () => {
        vi.mocked(getPlanChunkStatus).mockResolvedValue(_chunkResponse({
            running_now_count: 1, scheduled_count: 0, pending_user_action_count: 1, in_flight_count: 2,
        }));
        render(<Recipes />, { customContext: { ..._ctx, planData: _planVacio() } });
        expect(await screen.findByText('Tus próximos días están en pausa')).toBeInTheDocument();
    });

    it('solo programado → «aún no toca prepararlos»', async () => {
        vi.mocked(getPlanChunkStatus).mockResolvedValue(_chunkResponse({
            running_now_count: 0, scheduled_count: 3, pending_user_action_count: 0, in_flight_count: 3,
        }));
        render(<Recipes />, { customContext: { ..._ctx, planData: _planVacio() } });
        expect(await screen.findByText('Estos días aún no toca prepararlos')).toBeInTheDocument();
    });

    it('sin cola viva → el vacío estático de siempre', async () => {
        vi.mocked(getPlanChunkStatus).mockResolvedValue(_chunkResponse({
            running_now_count: 0, scheduled_count: 0, pending_user_action_count: 0, in_flight_count: 0,
        }));
        render(<Recipes />, { customContext: { ..._ctx, planData: _planVacio() } });
        expect(await screen.findByText('Aún no hay recetas para este día')).toBeInTheDocument();
    });

    it('plan sin estado activo (harnesses hermanos) → NI SE LLAMA a chunk-status', () => {
        const plan = _planVacio(undefined);
        delete plan.generation_status;
        render(<Recipes />, { customContext: { ..._ctx, planData: plan } });
        expect(screen.getByText('Aún no hay recetas para este día')).toBeInTheDocument();
        expect(vi.mocked(getPlanChunkStatus)).not.toHaveBeenCalled();
    });
});
