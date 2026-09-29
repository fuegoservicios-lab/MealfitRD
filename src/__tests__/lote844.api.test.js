/**
 * [P1-PLAN-LOTE-844 · 2026-09-29] El permiso para la IA en EL cliente de la API (`fetchWithAuth`), no en cada pantalla.
 *
 *  - El INVITADO manda `X-Bioboros-AI-Consent: ia-2026-10` en sus llamadas (sin ella, el backend responde 428).
 *  - Una petición CON sesión NUNCA la manda (contrato ampliado tras la revisión del backend 843: el backend trata un
 *    token inválido o caducado como invitado; una cabecera sacada del dispositivo podría colar una llamada a la IA de
 *    alguien que retiró su permiso en otro dispositivo).
 *  - Cualquier 428 `ai_consent_required` abre la hoja y, aceptada, repite la petición UNA vez (también el SSE: el 428
 *    llega con las cabeceras). «Ahora no» devuelve el 428. El 503 `ai_consent_unavailable` no abre nada.
 *  - La adopción del plan del invitado lleva su `session_id`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBackendToken } from '../authClient';
import { fetchWithAuth } from '../config/api';
import {
    _reiniciarConsentimientoIAParaTests,
    aceptarConsentimientoIA,
    fijarTitularConsentimientoIA,
    rechazarConsentimientoIA,
    suscribirHojaConsentimientoIA,
} from '../consent/consentimientoIA';
import { AI_CONSENT_HEADER, AI_CONSENT_STORAGE_KEY, AI_CONSENT_VERSION } from '../consent/version';

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const SID = 'sesion-invitado-1234';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const R428 = () => json(428, { error_code: 'ai_consent_required', version: AI_CONSENT_VERSION, detail: 'Para usar la IA necesitamos tu permiso.' });
const cabeceraDe = (llamada) => new Headers(llamada[1].headers).get(AI_CONSENT_HEADER);

const invitadoConPermiso = () => {
    localStorage.setItem('mealfit_user_id', 'guest');
    localStorage.setItem('mealfit_guest_session_id', SID);
    localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: AI_CONSENT_VERSION, at: '2026-09-29T10:00:00Z', quien: `invitado:${SID}`, analytics: false }));
};

beforeEach(() => {
    _reiniciarConsentimientoIAParaTests();
    localStorage.clear();
    getBackendToken.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('[P1-PLAN-LOTE-844] la cabecera del invitado', () => {
    it('el invitado con permiso la manda en sus llamadas', async () => {
        invitadoConPermiso();
        fetch.mockResolvedValue(json(200, {}));
        await fetchWithAuth('/api/help/chat', { method: 'POST', body: '{}' });
        expect(cabeceraDe(fetch.mock.calls[0])).toBe(AI_CONSENT_VERSION);
    });

    it('sin permiso, con el de OTRA sesión de invitado o con el de otra versión, no la manda', async () => {
        fetch.mockResolvedValue(json(200, {}));
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', SID);
        await fetchWithAuth('/api/help/chat');
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: AI_CONSENT_VERSION, at: 'x', quien: 'invitado:otra-sesion-99', analytics: null }));
        await fetchWithAuth('/api/help/chat');
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: 'ia-2025-01', at: 'x', quien: `invitado:${SID}`, analytics: null }));
        await fetchWithAuth('/api/help/chat');
        expect(fetch.mock.calls.map(cabeceraDe)).toEqual([null, null, null]);
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();   // el de otra versión, rancio, se borró
    });

    it('[contrato ampliado] una petición CON sesión nunca la manda, aunque quede un permiso de invitado en el dispositivo', async () => {
        invitadoConPermiso();
        fetch.mockResolvedValue(json(200, {}));
        getBackendToken.mockResolvedValue('jwt-de-la-cuenta');
        await fetchWithAuth('/api/chat/stream', { method: 'POST', body: '{}' });
        getBackendToken.mockResolvedValue(null);
        localStorage.setItem('mealfit_mf_session', 'sesion-propia');
        await fetchWithAuth('/api/chat/stream', { method: 'POST', body: '{}' });
        expect(fetch.mock.calls.map(cabeceraDe)).toEqual([null, null]);
    });

    it('[contrato ampliado] una cuenta cuyo token caducó (petición sin sesión) tampoco la manda: no hay permiso local de cuenta', async () => {
        localStorage.setItem('mealfit_user_id', '11111111-2222-3333-4444-555555555555');
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: AI_CONSENT_VERSION, at: 'x', quien: 'cuenta:11111111-2222-3333-4444-555555555555', analytics: null }));
        fetch.mockResolvedValue(json(200, {}));
        await fetchWithAuth('/api/chat/stream', { method: 'POST', body: '{}' });
        expect(cabeceraDe(fetch.mock.calls[0])).toBeNull();
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();   // no es de invitado: rancio, fuera
    });

    it('nunca hacia otro origen', async () => {
        invitadoConPermiso();
        fetch.mockResolvedValue(json(200, {}));
        await fetchWithAuth('https://otro-origen.example.com/x');
        expect(cabeceraDe(fetch.mock.calls[0])).toBeNull();
    });
});

describe('[P1-PLAN-LOTE-844] el 428 en el cliente de la API', () => {
    it('abre la hoja, se acepta y la petición se repite UNA vez (un SSE igual: el 428 llega antes del stream)', async () => {
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', SID);
        fijarTitularConsentimientoIA({ invitado: true });
        const host = vi.fn();
        suscribirHojaConsentimientoIA(host);
        let intentos = 0;
        fetch.mockImplementation(async (url) => {
            if (String(url).endsWith('/api/consents/guest')) return json(200, { ok: true, version: AI_CONSENT_VERSION });
            intentos += 1;
            return intentos === 1 ? R428() : new Response('data: {"type":"chunk"}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        });
        const pendiente = fetchWithAuth('/api/chat/stream', { method: 'POST', body: '{"prompt":"hola"}' });
        await vi.waitFor(() => expect(host).toHaveBeenLastCalledWith({ automatica: false }));
        await aceptarConsentimientoIA({ analytics: false });
        const res = await pendiente;
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        expect(intentos).toBe(2);
        const llamadasAlChat = fetch.mock.calls.filter(([u]) => String(u).endsWith('/api/chat/stream'));
        expect(cabeceraDe(llamadasAlChat[0])).toBeNull();
        expect(cabeceraDe(llamadasAlChat[1])).toBe(AI_CONSENT_VERSION);   // el reintento ya lleva el permiso
    });

    it('con «Ahora no» devuelve el 428 (cuerpo legible) y no repite', async () => {
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', SID);
        fijarTitularConsentimientoIA({ invitado: true });
        const host = vi.fn();
        suscribirHojaConsentimientoIA(host);
        fetch.mockImplementation(async () => R428());
        const pendiente = fetchWithAuth('/api/diary/upload', { method: 'POST', body: new FormData() });
        await vi.waitFor(() => expect(host).toHaveBeenLastCalledWith({ automatica: false }));
        rechazarConsentimientoIA();
        const res = await pendiente;
        expect(res.status).toBe(428);
        expect(await res.json()).toMatchObject({ error_code: 'ai_consent_required' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('el 503 `ai_consent_unavailable` NO abre la hoja: pasa tal cual', async () => {
        const host = vi.fn();
        suscribirHojaConsentimientoIA(host);
        fetch.mockResolvedValue(json(503, { error_code: 'ai_consent_unavailable', version: AI_CONSENT_VERSION, detail: 'x' }));
        const res = await fetchWithAuth('/api/help/chat', { method: 'POST', body: '{}' });
        expect(res.status).toBe(503);
        expect(host).not.toHaveBeenCalledWith(expect.objectContaining({ automatica: expect.any(Boolean) }));
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe('[P1-PLAN-LOTE-844] la adopción del plan del invitado', () => {
    it('lleva el session_id del permiso del invitado, aunque `mealfit_guest_session_id` ya se haya borrado', async () => {
        invitadoConPermiso();
        localStorage.setItem('mealfit_user_id', '11111111-2222-3333-4444-555555555555');
        localStorage.removeItem('mealfit_guest_session_id');   // lo borra la entrada de la sesión (AssessmentContext)
        getBackendToken.mockResolvedValue('jwt-de-la-cuenta');
        fetch.mockResolvedValue(json(200, { adopted: true, plan_id: 'p1', ai_consent: { adoptadas: 2, estado_actualizado: true } }));
        await fetchWithAuth('/api/plans/adopt-guest-plan', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_data: { days: [1] }, form_data: {} }),
        });
        const [, opts] = fetch.mock.calls[0];
        expect(JSON.parse(opts.body)).toEqual({ plan_data: { days: [1] }, form_data: {}, session_id: SID });
        expect(cabeceraDe(fetch.mock.calls[0])).toBeNull();   // con sesión, jamás la cabecera
    });
});
