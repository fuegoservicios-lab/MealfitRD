import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [P1-BUDGET-422-CODE-LOST · 2026-06-22] Regresión: cuando el gate de presupuesto
// del backend (P2-BUDGET-FLOOR) rechaza la generación con HTTP 422
// {detail: {code:"budget_insufficient", error_code:"budget_below_goal_floor",
// message:"Tu presupuesto de RD$X es insuficiente...", min_budget, ...}}, el
// frontend mostraba "No pudimos conectarnos a la IA. Verifica tu conexión" —
// engañoso (no es de red, es presupuesto). Causa: `fetchWithRetry` NO tenía rama
// 422 (a diferencia de 429/409/402) → el error caía al throw genérico SIN `.code`
// → el caller no podía distinguirlo → fallback síncrono (otro 422) → offline_unavailable.
// Además se RE-INTENTABA (retries>1). Ahora el 422 propaga su `code` real + terminal,
// sin reintentar.

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
    getPlanChunkStatus: vi.fn(),
    retryPlanChunk: vi.fn(),
}));

vi.mock('../authClient', () => ({
    authClient: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
        from: vi.fn(),
    },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

import { fetchWithAuth } from '../config/api';
import { generateAIPlanStream } from '../pages/Plan';

// Response-like del backend: 422 con `detail` DICT (el caso real del gate de presupuesto).
const make422Budget = () => ({
    ok: false,
    status: 422,
    headers: { get: () => 'application/json' },
    json: async () => ({
        detail: {
            code: 'budget_insufficient',
            error_code: 'budget_below_goal_floor',
            min_budget: 6300,
            declared: 2000,
            currency: 'DOP',
            days: 30,
            household: 1,
            target_calories: 2100,
            message: 'Tu presupuesto de RD$2,000 es insuficiente para tus metas (2100 kcal/día × 30 días). El mínimo para un plan profesional es ~RD$6,300. Sube tu presupuesto o ajusta tus metas.',
        },
    }),
    text: async () => 'budget',
});

// 422 con detail STRING = rechazo crítico de restricción (endpoint síncrono).
const make422String = () => ({
    ok: false,
    status: 422,
    headers: { get: () => 'application/json' },
    json: async () => ({ detail: 'No pudimos generar un plan que respete tu alergia declarada.' }),
    text: async () => 'critical',
});

describe('P1-BUDGET-422-CODE-LOST — generateAIPlanStream budget gate handling', () => {
    beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('rechaza con code="budget_insufficient" (NO "offline_unavailable") en 422 de presupuesto', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(make422Budget());
        await expect(generateAIPlanStream({})).rejects.toMatchObject({ code: 'budget_insufficient' });
    });

    it('preserva el mensaje accionable del backend y NO degrada a "Sin conexión"', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(make422Budget());
        try {
            await generateAIPlanStream({});
            throw new Error('debería haber rechazado');
        } catch (err) {
            expect(err.code).toBe('budget_insufficient');
            expect(err.message.toLowerCase()).toContain('presupuesto');
            // El bug original mostraba "No pudimos conectarnos con la IA".
            expect(err.message.toLowerCase()).not.toContain('conexión');
            expect(err.message.toLowerCase()).not.toContain('conectarnos');
        }
    });

    it('NO reintenta ante 422 (validación determinista; el fallback pega el MISMO 422)', async () => {
        const mock = vi.mocked(fetchWithAuth).mockResolvedValue(make422Budget());
        await expect(generateAIPlanStream({})).rejects.toMatchObject({ code: 'budget_insufficient' });
        // Solo la llamada SSE: el code terminal se propaga antes del fallback síncrono.
        expect(mock).toHaveBeenCalledTimes(1);
    });

    it('422 con detail STRING propaga como critical_restriction (no offline)', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(make422String());
        await expect(generateAIPlanStream({})).rejects.toMatchObject({ code: 'critical_restriction' });
    });
});
