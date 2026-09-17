// [P1-PLAN-LOTE-90 · 2026-09-17] El arranque pregunta por la sesión first-party cuando ve el MARCADOR que viaja con la
// cookie (`__Host-mf_has_session=1`), no solo cuando encuentra el token en localStorage.
//
// Incidente (PWA de iOS del dueño, 17-sep 20:35 UTC): dos `POST /api/auth/email-otp/verify` → 200 con la sesión emitida
// y la cookie puesta; tras recargar, la app volvió a /login en <1 s SIN llamar a /api/auth/me — no había token en
// localStorage y esa era la única puerta. «Vuelve a iniciar sesión» no lo arreglaba: repetía lo mismo.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchWithTimeout = vi.fn();
vi.mock('../utils/fetchWithTimeout', () => ({ fetchWithTimeout: (...a) => fetchWithTimeout(...a), AUTH_BEST_EFFORT_TIMEOUT_MS: 1000 }));
vi.mock('../config/api', () => ({ api: (p) => p, fetchWithAuth: vi.fn() }));
vi.mock('../config/secureFormStorage', () => ({ setFormCryptoSecret: () => false }));
vi.mock('../i18n', () => ({ t: (s) => s }));

import {
    checkFirstPartySession, hasSessionMarker, clearSessionMarker, logoutFirstPartySession, getStoredMfSession,
} from '../utils/firstPartySession';

// jsdom no guarda cookies `Secure`/`__Host-` en http://localhost: se sustituye `document.cookie` por un tarro propio que
// entiende lo justo (nombre=valor y Max-Age=0).
let tarro = {};
const instalarTarro = () => {
    tarro = {};
    Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: () => Object.entries(tarro).map(([k, v]) => `${k}=${v}`).join('; '),
        set: (raw) => {
            const [par, ...attrs] = String(raw).split(';');
            const i = par.indexOf('=');
            const k = par.slice(0, i).trim();
            const v = par.slice(i + 1).trim();
            if (attrs.some((a) => a.trim().toLowerCase() === 'max-age=0')) delete tarro[k];
            else tarro[k] = v;
        },
    });
};

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

describe('sesión first-party: el marcador que viaja con la cookie', () => {
    beforeEach(() => {
        fetchWithTimeout.mockReset();
        localStorage.clear();
        instalarTarro();
    });

    it('visitante anónimo (sin token ni marcador): NO pregunta — sigue sin haber 401 de ruido', async () => {
        expect(await checkFirstPartySession()).toBeNull();
        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    it('EL INCIDENTE: sin token en localStorage pero con marcador, pregunta con la cookie y entra', async () => {
        tarro['__Host-mf_has_session'] = '1';
        fetchWithTimeout.mockResolvedValue(ok({ user_id: 'u-1', token: 'tok.nuevo.x', form_key: null }));
        const r = await checkFirstPartySession();
        expect(r.user_id).toBe('u-1');
        const [url, opts] = fetchWithTimeout.mock.calls[0];
        expect(url).toBe('/api/auth/me');
        expect(opts.credentials).toBe('include');
        expect(opts.headers['X-MF-Session']).toBeUndefined();
        // segunda oportunidad de guardar el token que el login no dejó
        expect(getStoredMfSession()).toBe('tok.nuevo.x');
    });

    it('con token sigue mandándolo por X-MF-Session (el PWA de iOS pierde la cookie entre lanzamientos)', async () => {
        localStorage.setItem('mealfit_mf_session', 'tok.viejo.y');
        fetchWithTimeout.mockResolvedValue(ok({ user_id: 'u-2', token: null }));
        await checkFirstPartySession();
        expect(fetchWithTimeout.mock.calls[0][1].headers['X-MF-Session']).toBe('tok.viejo.y');
    });

    it('401: caen el token Y el marcador — si quedara puesto, cada arranque repetiría el 401', async () => {
        tarro['__Host-mf_has_session'] = '1';
        localStorage.setItem('mealfit_mf_session', 'tok.muerto.z');
        fetchWithTimeout.mockResolvedValue({ ok: false, status: 401, json: async () => null });
        expect(await checkFirstPartySession()).toBeNull();
        expect(getStoredMfSession()).toBeNull();
        expect(hasSessionMarker()).toBe(false);
    });

    it('cerrar sesión SIN RED también cierra: el marcador cae desde el cliente', async () => {
        tarro['__Host-mf_has_session'] = '1';
        localStorage.setItem('mealfit_mf_session', 'tok.a.b');
        fetchWithTimeout.mockRejectedValue(new Error('offline'));
        await logoutFirstPartySession();
        expect(hasSessionMarker()).toBe(false);
        expect(getStoredMfSession()).toBeNull();
        // y el arranque siguiente ya no pregunta
        fetchWithTimeout.mockReset();
        expect(await checkFirstPartySession()).toBeNull();
        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    it('el marcador se reconoce por nombre Y valor exactos, entre otras cookies', () => {
        tarro = { a: '1', '__Host-mf_has_session': '1', b: '2' };
        expect(hasSessionMarker()).toBe(true);
        tarro = { '__Host-mf_has_session': '10' };
        expect(hasSessionMarker()).toBe(false);
        tarro = { 'x__Host-mf_has_session': '1' };
        expect(hasSessionMarker()).toBe(false);
        tarro = { '__Host-mf_has_session': '1' };
        clearSessionMarker();
        expect(hasSessionMarker()).toBe(false);
    });
});
