/**
 * [P1-PLAN-LOTE-844 · ronda 1] `fetchWithAuth` no importa nada de `consent/`: el módulo del permiso se engancha al
 * cargarse (lo carga el host de la hoja). Si no cargó —aún no, o nunca (un chunk perdido tras un despliegue)—, la
 * petición NO se cae: sale sin la cabecera del invitado, y un 428 llega tal cual a su llamador (el servidor sigue
 * siendo quien decide). Aquí el módulo del permiso ni siquiera se puede importar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithAuth } from '../config/api';
import { AI_CONSENT_HEADER, AI_CONSENT_STORAGE_KEY, AI_CONSENT_VERSION } from '../consent/version';

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));
vi.mock('../consent/cabecera', () => { throw new Error('chunk perdido'); });
vi.mock('../consent/consentimientoIA', () => { throw new Error('chunk perdido'); });

const SID = 'sesion-invitado-1234';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mealfit_user_id', 'guest');
    localStorage.setItem('mealfit_guest_session_id', SID);
    localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: AI_CONSENT_VERSION, at: '2026-09-29T10:00:00Z', quien: `invitado:${SID}`, analytics: false }));
    vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('[P1-PLAN-LOTE-844 · ronda 1] el módulo del permiso no carga', () => {
    it('la petición sale igual, sin la cabecera', async () => {
        fetch.mockResolvedValue(json(200, { ok: true }));
        const res = await fetchWithAuth('/api/help/chat', { method: 'POST', body: '{}' });
        expect(res.status).toBe(200);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(new Headers(fetch.mock.calls[0][1].headers).get(AI_CONSENT_HEADER)).toBeNull();
    });

    it('un 428 llega a su llamador tal cual, sin reintentos', async () => {
        fetch.mockResolvedValue(json(428, { error_code: 'ai_consent_required', version: AI_CONSENT_VERSION }));
        const res = await fetchWithAuth('/api/help/chat', { method: 'POST', body: '{}' });
        expect(res.status).toBe(428);
        expect((await res.json()).error_code).toBe('ai_consent_required');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('la adopción sale con su cuerpo de siempre', async () => {
        fetch.mockResolvedValue(json(200, { adopted: true }));
        const body = JSON.stringify({ plan_data: { days: [1] } });
        const res = await fetchWithAuth('/api/plans/adopt-guest-plan', { method: 'POST', body });
        expect(res.status).toBe(200);
        expect(fetch.mock.calls[0][1].body).toBe(body);
    });
});
