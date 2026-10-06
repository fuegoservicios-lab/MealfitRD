import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithAuth } from '../config/api';
import { AI_CONSENT_VERSION } from '../consent/version';
import {
    _reiniciarConsentimientoIAParaTests,
    asegurarConsentimientoIA,
    fijarTitularConsentimientoIA,
    rechazarConsentimientoIA,
    resolverPermisoRequerido,
    sincronizarConsentimientoIADesdePerfil,
    suscribirHojaConsentimientoIA,
} from '../consent/consentimientoIA';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
const UID = '11111111-2222-3333-4444-555555555555';
const sin = { vigente: false, ai_consent_version: null, ai_consent_at: null, ai_consent_revoked_at: null };
const con = { ...sin, vigente: true, ai_consent_version: AI_CONSENT_VERSION, ai_consent_at: '2026-10-06T12:00:00Z' };
const json = (status, body) => new Response(JSON.stringify(body), { status });
const iniciar = () => {
    fijarTitularConsentimientoIA({ uid: UID });
    sincronizarConsentimientoIADesdePerfil(UID, sin);
    const host = vi.fn();
    suscribirHojaConsentimientoIA(host);
    return host;
};
beforeEach(() => {
    _reiniciarConsentimientoIAParaTests();
    localStorage.clear();
    localStorage.setItem('mealfit_user_id', UID);
    fetchWithAuth.mockReset();
});

describe('el consentimiento guardado no se vuelve a pedir desde un perfil antiguo', () => {
    it('se conserva al reiniciar la app y recuperarse de nuevo un perfil en caché', async () => {
        fetchWithAuth.mockImplementation(() => Promise.resolve(json(200, con)));
        for (let apertura = 0; apertura < 2; apertura++) {
            _reiniciarConsentimientoIAParaTests();
            const host = iniciar();
            await expect(asegurarConsentimientoIA()).resolves.toBe(true);
            expect(host).not.toHaveBeenCalledWith(expect.objectContaining({ automatica: expect.any(Boolean) }));
        }
        expect(fetchWithAuth).toHaveBeenCalledTimes(2);
    });

    it('un 428 con permiso ya confirmado repite la petición una sola vez sin abrir el aviso', async () => {
        const host = iniciar();
        fetchWithAuth.mockResolvedValue(json(200, con));
        const reintentar = vi.fn().mockResolvedValue(json(200, { ok: true }));
        const res = await resolverPermisoRequerido(json(428, { error_code: 'ai_consent_required' }), reintentar);
        expect(res.status).toBe(200);
        expect(reintentar).toHaveBeenCalledTimes(1);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        expect(host).not.toHaveBeenCalledWith(expect.objectContaining({ automatica: expect.any(Boolean) }));
    });

    it('si se retiró el permiso en otro dispositivo sigue pidiendo una decisión explícita', async () => {
        const host = iniciar();
        fetchWithAuth.mockResolvedValue(json(200, { ...con, vigente: false, ai_consent_revoked_at: '2026-10-06T13:00:00Z' }));
        const puerta = asegurarConsentimientoIA();
        await vi.waitFor(() => expect(host).toHaveBeenCalledWith({ automatica: false }));
        rechazarConsentimientoIA();
        await expect(puerta).resolves.toBe(false);
    });
});
