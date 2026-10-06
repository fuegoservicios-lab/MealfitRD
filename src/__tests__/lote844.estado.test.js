/**
 * [P1-PLAN-LOTE-844 · 2026-09-29] El estado del permiso para la IA de terceros y su puerta, `asegurarConsentimientoIA`.
 *
 * Reglas que esto fija:
 *  - «sin saber» NO es «sin permiso»: sin titular o con el perfil aún en camino, la puerta NO espera (decide el 428);
 *  - el invitado guarda su permiso en el dispositivo, atado a SU session_id, y lo anota en el servidor ANTES de pasar;
 *  - una CUENTA no guarda nada en el dispositivo: su permiso vive en el servidor (contrato ampliado tras la revisión del
 *    backend: el token caducado cuenta como invitado, así que un permiso local de cuenta podría colar una llamada);
 *  - el permiso de invitado se BORRA en cuanto está rancio: otra versión, un 428, el servidor diciendo `vigente:false`,
 *    o al entrar la sesión (de él solo queda el session_id para la adopción de su plan);
 *  - «Ahora no» → false + «Activa la IA para usar esto»; la hoja que sale sola al abrir la app no vuelve a salir sola.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import {
    _reiniciarConsentimientoIAParaTests,
    aceptarConsentimientoIA,
    asegurarConsentimientoIA,
    conSesionDelPermisoInvitado,
    debePreguntarAlAbrirLaApp,
    estadoConsentimientoIA,
    faltaPermisoIA,
    fijarTitularConsentimientoIA,
    pedirHojaConsentimientoIA,
    rechazarConsentimientoIA,
    resolverPermisoRequerido,
    retirarConsentimientoIA,
    sincronizarConsentimientoIADesdePerfil,
    suscribirHojaConsentimientoIA,
    trasAdoptarPlanInvitado,
} from '../consent/consentimientoIA';
import { permisoLocalVigente } from '../consent/cabecera';
import { AI_CONSENT_STORAGE_KEY, AI_CONSENT_VERSION } from '../consent/version';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const SID = 'sesion-invitado-1234';
const UID = '11111111-2222-3333-4444-555555555555';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const SIN_PERMISO = { version: AI_CONSENT_VERSION, vigente: false, ai_consent_version: null, ai_consent_at: null, ai_cn_transfer_at: null, ai_consent_revoked_at: null, analytics: null };
const CON_PERMISO = { ...SIN_PERMISO, vigente: true, ai_consent_version: AI_CONSENT_VERSION, ai_consent_at: '2026-09-29T15:00:00+00:00', ai_cn_transfer_at: '2026-09-29T15:00:00+00:00', analytics: false };

const comoInvitado = (sid = SID) => {
    localStorage.setItem('mealfit_user_id', 'guest');
    localStorage.setItem('mealfit_guest_session_id', sid);
    fijarTitularConsentimientoIA({ uid: null, invitado: true });
};
const comoCuenta = (uid = UID) => {
    localStorage.setItem('mealfit_user_id', uid);
    fijarTitularConsentimientoIA({ uid, invitado: false });
};
const registroLocal = () => JSON.parse(localStorage.getItem(AI_CONSENT_STORAGE_KEY) || 'null');
const hostQueRecuerda = () => {
    const host = vi.fn();
    suscribirHojaConsentimientoIA(host);
    return host;
};

beforeEach(() => {
    _reiniciarConsentimientoIAParaTests();
    localStorage.clear();
    fetchWithAuth.mockReset();
    toast.info.mockReset();
});

describe('[P1-PLAN-LOTE-844] «sin saber» no es «sin permiso»', () => {
    it('sin titular (el host aún no montó) la puerta no espera, no abre la hoja y no llama a nadie', async () => {
        const host = hostQueRecuerda();
        expect(faltaPermisoIA()).toBe(false);
        await expect(asegurarConsentimientoIA()).resolves.toBe(true);
        expect(host).not.toHaveBeenCalledWith(expect.objectContaining({ automatica: expect.any(Boolean) }));
        expect(fetchWithAuth).not.toHaveBeenCalled();
    });

    it('una cuenta con el perfil aún en camino tampoco espera: decide el servidor (428)', async () => {
        comoCuenta();
        expect(estadoConsentimientoIA()).toMatchObject({ tipo: 'cuenta', vigente: null });
        await expect(asegurarConsentimientoIA()).resolves.toBe(true);
    });
});

describe('[P1-PLAN-LOTE-844] el invitado', () => {
    it('sin permiso, la puerta abre la hoja; al aceptar lo anota con SU session_id y queda la cabecera lista', async () => {
        comoInvitado();
        expect(faltaPermisoIA()).toBe(true);
        const host = hostQueRecuerda();
        const puerta = asegurarConsentimientoIA();
        expect(host).toHaveBeenLastCalledWith({ automatica: false });
        fetchWithAuth.mockResolvedValue(json(200, { ok: true, version: AI_CONSENT_VERSION, header: 'X-Bioboros-AI-Consent', ai: true, analytics: false }));
        const r = await aceptarConsentimientoIA({ analytics: false, textoSha256: 'a'.repeat(64) });
        expect(r).toEqual({ ok: true, planReanudado: false });
        await expect(puerta).resolves.toBe(true);
        expect(host).toHaveBeenLastCalledWith(null);
        const [url, opts] = fetchWithAuth.mock.calls[0];
        expect(url).toBe('/api/consents/guest');
        expect(JSON.parse(opts.body)).toMatchObject({
            version: AI_CONSENT_VERSION, ai_processing: true, ai_transfer_cn: true, analytics: false,
            session_id: SID, text_sha256: 'a'.repeat(64), platform: 'web',
        });
        expect(registroLocal()).toMatchObject({ v: AI_CONSENT_VERSION, quien: `invitado:${SID}`, analytics: false });
        expect(permisoLocalVigente()).toBeTruthy();
        expect(faltaPermisoIA()).toBe(false);
    });

    it('si el servidor no lo anota, no pasa nada: la hoja sigue abierta y no queda permiso en el dispositivo', async () => {
        comoInvitado();
        hostQueRecuerda();
        const puerta = asegurarConsentimientoIA();
        fetchWithAuth.mockResolvedValue(json(503, { error_code: 'ai_consent_unavailable', version: AI_CONSENT_VERSION, detail: 'x' }));
        const r = await aceptarConsentimientoIA({ analytics: false });
        expect(r).toEqual({ ok: false, codigo: 'ai_consent_unavailable' });
        expect(registroLocal()).toBeNull();
        let resuelta = false;
        puerta.then(() => { resuelta = true; });
        await Promise.resolve();
        expect(resuelta).toBe(false);
        rechazarConsentimientoIA();
        await expect(puerta).resolves.toBe(false);
    });

    it('«Ahora no»: la puerta devuelve false y avisa «Activa la IA para usar esto»', async () => {
        comoInvitado();
        hostQueRecuerda();
        const puerta = asegurarConsentimientoIA();
        rechazarConsentimientoIA();
        await expect(puerta).resolves.toBe(false);
        expect(toast.info).toHaveBeenCalledWith('Activa la IA para usar esto', expect.objectContaining({ id: 'mf-ia-permiso' }));
        expect(fetchWithAuth).not.toHaveBeenCalled();
    });

    it('otro «Probar sin cuenta» (session_id nuevo) es otra persona posible: se le vuelve a preguntar', async () => {
        comoInvitado();
        hostQueRecuerda();
        const puerta = asegurarConsentimientoIA();
        fetchWithAuth.mockResolvedValue(json(200, { ok: true }));
        await aceptarConsentimientoIA({});
        await puerta;
        expect(faltaPermisoIA()).toBe(false);
        localStorage.setItem('mealfit_guest_session_id', 'otra-sesion-5678');
        expect(faltaPermisoIA()).toBe(true);
    });

    it('un permiso de OTRA versión está rancio: no vale y se borra al leerlo', () => {
        comoInvitado();
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: 'ia-2025-01', at: 'x', quien: `invitado:${SID}` }));
        expect(permisoLocalVigente()).toBeNull();
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();
        expect(faltaPermisoIA()).toBe(true);
    });
});

describe('[P1-PLAN-LOTE-844] la cuenta: su permiso vive en el servidor, nunca en el dispositivo', () => {
    it('el perfil dice que falta ⇒ la hoja; aceptar hace POST /api/consents SIN session_id y no guarda nada local', async () => {
        comoCuenta();
        sincronizarConsentimientoIADesdePerfil(UID, SIN_PERMISO);
        expect(faltaPermisoIA()).toBe(true);
        hostQueRecuerda();
        const puerta = asegurarConsentimientoIA();
        fetchWithAuth.mockResolvedValue(json(200, { ...CON_PERMISO, plan_reanudado: false }));
        await aceptarConsentimientoIA({ analytics: true, textoSha256: null });
        await expect(puerta).resolves.toBe(true);
        const [url, opts] = fetchWithAuth.mock.calls.find(([, options]) => options?.method === 'POST');
        expect(url).toBe('/api/consents');
        const cuerpo = JSON.parse(opts.body);
        expect(cuerpo).toMatchObject({ version: AI_CONSENT_VERSION, ai_processing: true, ai_transfer_cn: true, analytics: true });
        expect(cuerpo.session_id).toBeUndefined();
        expect(cuerpo.text_sha256).toBeUndefined();
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();
        expect(permisoLocalVigente()).toBeNull();
        expect(estadoConsentimientoIA()).toMatchObject({ tipo: 'cuenta', vigente: true, version: AI_CONSENT_VERSION });
    });

    it('un perfil leído ANTES de aceptar no pisa la decisión; uno más reciente (otro dispositivo) sí', async () => {
        comoCuenta();
        sincronizarConsentimientoIADesdePerfil(UID, SIN_PERMISO);
        hostQueRecuerda();
        const puerta = asegurarConsentimientoIA();
        fetchWithAuth.mockResolvedValue(json(200, CON_PERMISO));
        await aceptarConsentimientoIA({});
        await puerta;
        sincronizarConsentimientoIADesdePerfil(UID, SIN_PERMISO);
        expect(estadoConsentimientoIA().vigente).toBe(true);
        sincronizarConsentimientoIADesdePerfil(UID, { ...CON_PERMISO, vigente: false, ai_consent_revoked_at: '2026-09-30T10:00:00+00:00' });
        expect(estadoConsentimientoIA()).toMatchObject({ vigente: false, revocadoEn: '2026-09-30T10:00:00+00:00' });
    });

    it('[contrato 843 ampliado] entrar en una cuenta retira el permiso del invitado del dispositivo; su session_id queda para la adopción', () => {
        comoInvitado();
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: AI_CONSENT_VERSION, at: 'x', quien: `invitado:${SID}`, analytics: null }));
        expect(permisoLocalVigente()).toBeTruthy();
        comoCuenta();
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();
        expect(permisoLocalVigente()).toBeNull();
        const opts = conSesionDelPermisoInvitado({ method: 'POST', body: JSON.stringify({ plan_data: { days: [1] } }) });
        expect(JSON.parse(opts.body)).toEqual({ plan_data: { days: [1] }, session_id: SID });
    });

    it('[contrato 843 ampliado] el servidor dice `vigente:false` ⇒ cualquier permiso de invitado que quede se borra', () => {
        comoCuenta();
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: AI_CONSENT_VERSION, at: 'x', quien: `invitado:${SID}`, analytics: null }));
        sincronizarConsentimientoIADesdePerfil(UID, { ...CON_PERMISO, vigente: false, ai_consent_revoked_at: '2026-09-30T10:00:00+00:00' });
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();
    });

    it('retirar: POST /withdraw, queda sin permiso con su fecha, y la hoja no vuelve a salir sola', async () => {
        comoCuenta();
        sincronizarConsentimientoIADesdePerfil(UID, CON_PERMISO);
        fetchWithAuth.mockResolvedValue(json(200, { ...CON_PERMISO, vigente: false, ai_consent_revoked_at: '2026-09-30T10:00:00+00:00', plan_pausado: true }));
        await expect(retirarConsentimientoIA()).resolves.toEqual({ planPausado: true });
        expect(fetchWithAuth.mock.calls[0][0]).toBe('/api/consents/withdraw');
        expect(estadoConsentimientoIA()).toMatchObject({ vigente: false, revocadoEn: '2026-09-30T10:00:00+00:00' });
        expect(debePreguntarAlAbrirLaApp()).toBe(false);
    });
});

describe('[P1-PLAN-LOTE-844] la hoja que sale sola al abrir la app', () => {
    it('sale a una cuenta a la que aún no se le preguntó; tras «Ahora no» ya no sale sola', async () => {
        comoCuenta();
        sincronizarConsentimientoIADesdePerfil(UID, SIN_PERMISO);
        expect(debePreguntarAlAbrirLaApp()).toBe(true);
        hostQueRecuerda();
        const p = pedirHojaConsentimientoIA({ automatica: true });
        rechazarConsentimientoIA();
        await expect(p).resolves.toBe(false);
        expect(debePreguntarAlAbrirLaApp()).toBe(false);
    });

    it('no sale al invitado, ni con el permiso dado, ni con la adopción de un plan de invitado en camino', () => {
        comoInvitado();
        expect(debePreguntarAlAbrirLaApp()).toBe(false);
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: AI_CONSENT_VERSION, at: 'x', quien: `invitado:${SID}`, analytics: null }));
        comoCuenta();
        sincronizarConsentimientoIADesdePerfil(UID, SIN_PERMISO);
        expect(debePreguntarAlAbrirLaApp()).toBe(false);
        // la cuenta ya tenía plan (409): no hubo adopción; el session_id ya no sirve y la hoja vuelve a poder salir
        return trasAdoptarPlanInvitado(false).then(() => {
            expect(fetchWithAuth).not.toHaveBeenCalled();
            expect(debePreguntarAlAbrirLaApp()).toBe(true);
            sincronizarConsentimientoIADesdePerfil(UID, CON_PERMISO);
            expect(debePreguntarAlAbrirLaApp()).toBe(false);
        });
    });

    it('una adopción que salió bien relee el permiso de la cuenta (pudo pasar el del invitado, con su fecha)', async () => {
        comoCuenta();
        sincronizarConsentimientoIADesdePerfil(UID, SIN_PERMISO);
        fetchWithAuth.mockResolvedValue(json(200, CON_PERMISO));
        await trasAdoptarPlanInvitado(true);
        expect(fetchWithAuth.mock.calls[0][0]).toBe('/api/consents');
        expect(estadoConsentimientoIA()).toMatchObject({ vigente: true, aceptadoEn: CON_PERMISO.ai_consent_at });
    });
});

describe('[P1-PLAN-LOTE-844] el 428 de cualquier endpoint', () => {
    it('`ai_consent_required` abre la hoja y, aceptada, repite la petición UNA vez', async () => {
        comoInvitado();
        const host = hostQueRecuerda();
        const reintentar = vi.fn(async () => json(200, { reply: 'hola' }));
        const final = resolverPermisoRequerido(json(428, { error_code: 'ai_consent_required', version: AI_CONSENT_VERSION, detail: 'x' }), reintentar);
        await vi.waitFor(() => expect(host).toHaveBeenLastCalledWith({ automatica: false }));
        fetchWithAuth.mockResolvedValue(json(200, { ok: true }));
        await aceptarConsentimientoIA({});
        const res = await final;
        expect(res.status).toBe(200);
        expect(reintentar).toHaveBeenCalledTimes(1);
    });

    it('con «Ahora no» devuelve el 428 tal cual y avisa; un permiso de invitado que hubiera queda borrado', async () => {
        comoInvitado();
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: AI_CONSENT_VERSION, at: 'x', quien: `invitado:${SID}`, analytics: null }));
        const host = hostQueRecuerda();
        const reintentar = vi.fn();
        const original = json(428, { error_code: 'ai_consent_required', version: AI_CONSENT_VERSION, detail: 'x' });
        const final = resolverPermisoRequerido(original, reintentar);
        await vi.waitFor(() => expect(host).toHaveBeenLastCalledWith({ automatica: false }));
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();
        rechazarConsentimientoIA();
        const res = await final;
        // El llamador recibe el 428 con su cuerpo INTACTO (se leyó una vez, sin clone(), y se le da una copia).
        expect(res.status).toBe(428);
        expect(await res.json()).toMatchObject({ error_code: 'ai_consent_required' });
        expect(reintentar).not.toHaveBeenCalled();
        expect(toast.info).toHaveBeenCalledWith('Activa la IA para usar esto', expect.any(Object));
    });

    it('un 428 que no es del permiso no abre nada y llega intacto', async () => {
        const host = hostQueRecuerda();
        const res = await resolverPermisoRequerido(json(428, { detail: 'precondition' }), vi.fn());
        expect(res.status).toBe(428);
        expect(await res.json()).toEqual({ detail: 'precondition' });
        expect(host).not.toHaveBeenCalledWith(expect.objectContaining({ automatica: expect.any(Boolean) }));
    });
});

describe('[P1-PLAN-LOTE-844] la adopción del plan del invitado', () => {
    it('sin permiso de invitado en el dispositivo, el cuerpo no cambia; un session_id ya presente se respeta', () => {
        const opts = { method: 'POST', body: JSON.stringify({ plan_data: {} }) };
        expect(conSesionDelPermisoInvitado(opts)).toBe(opts);
        comoInvitado();
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ v: AI_CONSENT_VERSION, at: 'x', quien: `invitado:${SID}`, analytics: null }));
        const conSuyo = { method: 'POST', body: JSON.stringify({ plan_data: {}, session_id: 'suyo-123456' }) };
        expect(conSesionDelPermisoInvitado(conSuyo)).toBe(conSuyo);
    });
});
