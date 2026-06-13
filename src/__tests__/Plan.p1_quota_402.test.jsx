import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [P1-QUOTA-402-UX · 2026-05-30] Regresión: cuando el usuario agota su cap
// mensual de créditos (gratis=15/basic=50/plus=200), el backend gatea la
// generación con HTTP 402 (`verify_api_quota`). Pre-fix el 402 caía al branch
// genérico `!response.ok` (sin `.code`) → el outer catch disparaba el fallback
// síncrono (MISMO paywall → otro 402) → terminaba emitiendo
// `offline_unavailable` ("No pudimos conectarnos con la IA"). El usuario sin
// créditos veía un error de RED FALSO + loop a /assessment, SIN ver nunca el
// CTA de mejora de plan (conversión perdida). Ahora `generateAIPlanStream`
// DEBE rechazar con `code='quota_exceeded'` preservando el mensaje del backend,
// sin reintentar el endpoint síncrono.

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
    getPlanChunkStatus: vi.fn(),
    retryPlanChunk: vi.fn(),
}));

vi.mock('../supabase', () => ({
    supabase: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
        from: vi.fn(),
    },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

import { fetchWithAuth } from '../config/api';
import { generateAIPlanStream } from '../pages/Plan';

// Response-like del backend: 402 con `detail` (el mensaje real que el usuario
// debe ver). `headers.get` se incluye por robustez aunque el branch 402 de
// `fetchWithRetry` corta ANTES del check de content-type SSE.
const make402 = () => ({
    ok: false,
    status: 402,
    headers: { get: () => 'application/json' },
    json: async () => ({
        detail: 'Límite de créditos alcanzado para tu plan gratis (15/15). Mejora tu plan para continuar.',
    }),
    text: async () => 'paywall',
});

describe('P1-QUOTA-402-UX — generateAIPlanStream paywall handling', () => {
    beforeEach(() => {
        vi.mocked(fetchWithAuth).mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('rechaza con code="quota_exceeded" (NO "offline_unavailable") cuando el backend devuelve 402', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(make402());
        await expect(generateAIPlanStream({})).rejects.toMatchObject({ code: 'quota_exceeded' });
    });

    it('preserva el mensaje del backend (CTA de upgrade) y NO degrada a "Sin conexión"', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(make402());
        try {
            await generateAIPlanStream({});
            throw new Error('debería haber rechazado');
        } catch (err) {
            expect(err.code).toBe('quota_exceeded');
            expect(typeof err.message).toBe('string');
            expect(err.message.toLowerCase()).toContain('crédito');
            // El bug original mostraba "No pudimos conectarnos con la IA".
            expect(err.message.toLowerCase()).not.toContain('conexión');
            expect(err.message.toLowerCase()).not.toContain('conectarnos');
        }
    });

    it('NO reintenta el endpoint síncrono ante 402 (el fallback pega el MISMO paywall)', async () => {
        const mock = vi.mocked(fetchWithAuth).mockResolvedValue(make402());
        await expect(generateAIPlanStream({})).rejects.toMatchObject({ code: 'quota_exceeded' });
        // Solo la llamada SSE: `quota_exceeded` se propaga antes de la rama
        // `else` del fallback síncrono, evitando un round-trip desperdiciado.
        expect(mock).toHaveBeenCalledTimes(1);
    });
});
