import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [P0-1] Regresión: el plan de respaldo offline solía retornar comida con
// alérgenos comunes (maní, pescado, lácteos, gluten) sin filtrar contra
// `formData.allergies`/`dietType`/`medicalConditions`. Riesgo médico directo.
// Ahora `generateAIPlanStream` debe RECHAZAR con `code='offline_unavailable'`
// cuando SSE y el endpoint síncrono fallan, en lugar de devolver un plan.

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

const ALLERGEN_KEYWORDS = [
    'Mangú',
    'Pescado al Papillote',
    'Mantequilla de Maní',
    'Yogur Griego',
    'Ensalada de Atún',
    'Avena con Frutas',
];

describe('P0-1 — generateAIPlanStream offline fallback', () => {
    beforeEach(() => {
        vi.mocked(fetchWithAuth).mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('rechaza con code="offline_unavailable" cuando SSE y endpoint síncrono fallan (no retorna plan hardcoded)', async () => {
        // SSE y fallback ambos abortan inmediatamente. Usamos AbortError para
        // que `fetchWithRetry` NO entre en backoff (línea 57: AbortError no
        // se reintenta) — el test corre sin esperar timers.
        const abortErr = new Error('aborted');
        abortErr.name = 'AbortError';
        vi.mocked(fetchWithAuth).mockRejectedValue(abortErr);

        const formData = {
            // Usuario alérgico al maní + dieta vegana — el plan hardcoded
            // anterior incluía "Mantequilla de Maní" y "Pescado al Papillote",
            // que habrían sido entregados sin filtrar.
            allergies: ['mani', 'pescado', 'lacteos'],
            dietType: 'vegan',
            medicalConditions: ['celiac'],
        };

        await expect(generateAIPlanStream(formData)).rejects.toMatchObject({
            code: 'offline_unavailable',
        });
    });

    it('el código fuente de generateAIPlanStream NO contiene meals hardcoded del plan offline retirado', async () => {
        // Defensa secundaria: snapshot del .toString() de la función, para
        // detectar si alguien re-introduce el plan hardcoded de respaldo.
        const src = generateAIPlanStream.toString();
        for (const keyword of ALLERGEN_KEYWORDS) {
            expect(src).not.toContain(keyword);
        }
    });

    it('propaga `code="offline_unavailable"` con mensaje human-readable (no "undefined")', async () => {
        const abortErr = new Error('aborted');
        abortErr.name = 'AbortError';
        vi.mocked(fetchWithAuth).mockRejectedValue(abortErr);

        try {
            await generateAIPlanStream({});
            throw new Error('debería haber rechazado');
        } catch (err) {
            expect(err.code).toBe('offline_unavailable');
            expect(typeof err.message).toBe('string');
            expect(err.message.length).toBeGreaterThan(0);
            expect(err.message.toLowerCase()).not.toContain('undefined');
        }
    });
});
