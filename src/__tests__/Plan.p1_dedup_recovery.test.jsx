import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// [P1-SSE-DEDUP-PROPAGATE · 2026-06-25] Regresión del bug enmascarado: el 409
// `plan_recently_created` del stream (dedup: el user reintentó tras caerse la conexión TRAS
// generar el plan) NO estaba en la lista de propagación de `generateAIPlanStream` → caía al
// fallback síncrono → recibía el MISMO 409 del dedup → terminaba masked como
// `offline_unavailable` ("Sin conexión con la IA") → el handler de `plan_recently_created` en
// processPlan era INALCANZABLE vía SSE → el user reintentaba y DUPLICABA la generación (quema
// crédito). El fix propaga el code + planId sin caer al fallback. Este test falla en el código
// pre-fix (propagaría offline_unavailable + 2 llamadas a fetchWithAuth) y pasa post-fix.

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

// Response-like con status 409 y el body JSON del dedup (lo que emite el backend).
const make409 = (detail) => ({
    ok: false,
    status: 409,
    headers: { get: () => '' },
    json: async () => ({ detail }),
    clone() { return this; },
    text: async () => JSON.stringify({ detail }),
});

describe('P1-SSE-DEDUP-PROPAGATE — 409 plan_recently_created propaga (no masked a offline)', () => {
    beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('propaga code="plan_recently_created" + planId (NO offline_unavailable)', async () => {
        const detail = { code: 'plan_recently_created', plan_id: 'plan-abc-123', message: 'Ya creaste un plan hace poco.' };
        vi.mocked(fetchWithAuth).mockResolvedValue(make409(detail));

        await expect(generateAIPlanStream({})).rejects.toMatchObject({
            code: 'plan_recently_created',
            planId: 'plan-abc-123',
        });
    });

    it('NO cae al fallback síncrono (fetchWithAuth se llama una sola vez)', async () => {
        // Pre-fix: el 409 caía al `else` → fallback a FALLBACK_URL → 2da llamada a fetchWithAuth.
        // Post-fix: se propaga sin fallback → exactamente 1 llamada (solo el stream).
        const detail = { code: 'plan_recently_created', plan_id: 'p1', message: 'x' };
        vi.mocked(fetchWithAuth).mockResolvedValue(make409(detail));

        await generateAIPlanStream({}).catch(() => {});
        expect(vi.mocked(fetchWithAuth)).toHaveBeenCalledTimes(1);
    });

    it('el code propagado nunca es offline_unavailable (el bug original)', async () => {
        const detail = { code: 'plan_recently_created', plan_id: 'p1', message: 'x' };
        vi.mocked(fetchWithAuth).mockResolvedValue(make409(detail));
        try {
            await generateAIPlanStream({});
            throw new Error('debió rechazar');
        } catch (err) {
            expect(err.code).toBe('plan_recently_created');
            expect(err.code).not.toBe('offline_unavailable');
        }
    });
});
