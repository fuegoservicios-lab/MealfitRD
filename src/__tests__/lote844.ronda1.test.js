/**
 * [P1-PLAN-LOTE-844 · ronda 1] Arreglos de la revisión:
 *  - un GET /api/consents que salió ANTES de aceptar no devuelve el estado viejo al llegar;
 *  - un 428 tardío (la petición salió antes de dar el permiso) repite sin reabrir la hoja ni borrar el permiso recién
 *    dado;
 *  - el permiso de OTRA sesión de invitado se borra al leerlo y no viaja a la adopción;
 *  - la bandera de analítica se escribe ANTES de avisar del cambio de permiso (Configuración la relee al enterarse);
 *  - el botón «Activar la IA» del panel abre la hoja sin el aviso de «Ahora no»; la hoja tiene respaldo sin `dvh`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getBackendToken } from '../authClient';
import { fetchWithAuth } from '../config/api';
import {
    _reiniciarConsentimientoIAParaTests,
    aceptarConsentimientoIA,
    conSesionDelPermisoInvitado,
    estadoConsentimientoIA,
    fijarTitularConsentimientoIA,
    refrescarConsentimientoIA,
    suscribirConsentimientoIA,
    suscribirHojaConsentimientoIA,
} from '../consent/consentimientoIA';
import { permisoLocalVigente } from '../consent/cabecera';
import { isAnalyticsOptedOut, persistAnalyticsOptOut } from '../utils/analytics';
import { AI_CONSENT_HEADER, AI_CONSENT_STORAGE_KEY, AI_CONSENT_VERSION } from '../consent/version';

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const SID = 'sesion-invitado-1234';
const OTRO_SID = 'sesion-invitado-9999';
const UID = '11111111-2222-3333-4444-555555555555';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const R428 = () => json(428, { error_code: 'ai_consent_required', version: AI_CONSENT_VERSION, detail: 'x' });
const SIN_PERMISO = { version: AI_CONSENT_VERSION, vigente: false, ai_consent_version: null, ai_consent_at: null, ai_cn_transfer_at: null, ai_consent_revoked_at: null, analytics: null };
const CON_PERMISO = { ...SIN_PERMISO, vigente: true, ai_consent_version: AI_CONSENT_VERSION, ai_consent_at: '2026-09-29T15:00:00+00:00', ai_cn_transfer_at: '2026-09-29T15:00:00+00:00', analytics: true };
const registroDe = (sid) => JSON.stringify({ v: AI_CONSENT_VERSION, at: '2026-09-29T10:00:00Z', quien: `invitado:${sid}`, analytics: false });
const diferido = () => {
    let resolver;
    const promesa = new Promise((r) => { resolver = r; });
    return { promesa, resolver };
};
const hojasPedidas = (host) => host.mock.calls.filter(([p]) => p && typeof p.automatica === 'boolean').length;
const ruta = (llamada) => String(llamada[0]);

beforeEach(() => {
    _reiniciarConsentimientoIAParaTests();
    localStorage.clear();
    getBackendToken.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('[P1-PLAN-LOTE-844 · ronda 1] las respuestas viejas no pisan una decisión nueva', () => {
    it('aceptar mientras un GET /api/consents está en vuelo no vuelve al estado viejo', async () => {
        localStorage.setItem('mealfit_user_id', UID);
        getBackendToken.mockResolvedValue('jwt');
        fijarTitularConsentimientoIA({ uid: UID });
        const get = diferido();
        fetch.mockImplementation((url, init) => {
            if (String(url).endsWith('/api/consents') && (!init || !init.method || init.method === 'GET')) return get.promesa;
            return Promise.resolve(json(200, CON_PERMISO));
        });
        const refresco = refrescarConsentimientoIA();
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        await expect(aceptarConsentimientoIA({ analytics: true })).resolves.toMatchObject({ ok: true });
        expect(estadoConsentimientoIA().vigente).toBe(true);
        get.resolver(json(200, SIN_PERMISO));   // la respuesta del GET que salió ANTES
        await refresco;
        expect(estadoConsentimientoIA().vigente).toBe(true);
    });
});

describe('[P1-PLAN-LOTE-844 · ronda 1] el 428 tardío', () => {
    it('una petición que salió antes de aceptar: se repite con el permiso, sin reabrir la hoja ni borrarlo', async () => {
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', SID);
        fijarTitularConsentimientoIA({ invitado: true });
        const host = vi.fn();
        suscribirHojaConsentimientoIA(host);
        const primera = diferido();
        let llamadasChat = 0;
        fetch.mockImplementation((url) => {
            if (String(url).includes('/api/consents/guest')) return Promise.resolve(json(200, { ok: true, version: AI_CONSENT_VERSION }));
            llamadasChat += 1;
            return llamadasChat === 1 ? primera.promesa : Promise.resolve(json(200, { respuesta: 'hola' }));
        });
        const chat = fetchWithAuth('/api/help/chat', { method: 'POST', body: '{}' });
        await vi.waitFor(() => expect(llamadasChat).toBe(1));
        await expect(aceptarConsentimientoIA({})).resolves.toMatchObject({ ok: true });
        primera.resolver(R428());   // llega tarde: la petición viajó sin permiso
        const res = await chat;
        expect(res.status).toBe(200);
        expect(hojasPedidas(host)).toBe(0);
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).not.toBeNull();
        const chats = fetch.mock.calls.filter((c) => ruta(c).includes('/api/help/chat'));
        expect(chats).toHaveLength(2);
        expect(new Headers(chats[1][1].headers).get(AI_CONSENT_HEADER)).toBe(AI_CONSENT_VERSION);
    });

    it('un 428 de una petición que salió DESPUÉS de aceptar sí es de verdad: abre la hoja', async () => {
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', SID);
        fijarTitularConsentimientoIA({ invitado: true });
        fetch.mockImplementation((url) => Promise.resolve(String(url).includes('/api/consents/guest')
            ? json(200, { ok: true })
            : R428()));
        await aceptarConsentimientoIA({});
        await new Promise((r) => setTimeout(r, 5));
        const host = vi.fn();
        suscribirHojaConsentimientoIA(host);
        void fetchWithAuth('/api/help/chat', { method: 'POST', body: '{}' });
        await vi.waitFor(() => expect(hojasPedidas(host)).toBe(1));
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();
    });
});

describe('[P1-PLAN-LOTE-844 · ronda 1] el permiso de otra sesión de invitado', () => {
    it('se borra al leerlo cuando el invitado actual es otro', () => {
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', OTRO_SID);
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, registroDe(SID));
        expect(permisoLocalVigente()).toBeNull();
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();
    });

    it('el de la sesión actual se conserva', () => {
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', SID);
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, registroDe(SID));
        expect(permisoLocalVigente()).toMatchObject({ quien: `invitado:${SID}` });
    });

    it('la adopción no lleva el session_id de un registro de otra sesión de invitado', () => {
        localStorage.setItem('mealfit_user_id', UID);
        localStorage.setItem('mealfit_guest_session_id', OTRO_SID);
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, registroDe(SID));
        const body = JSON.stringify({ plan_data: {} });
        expect(conSesionDelPermisoInvitado({ method: 'POST', body }).body).toBe(body);
        localStorage.setItem('mealfit_guest_session_id', SID);
        expect(JSON.parse(conSesionDelPermisoInvitado({ method: 'POST', body }).body).session_id).toBe(SID);
    });

    it('al entrar en la cuenta solo pasa a la adopción el permiso de la sesión actual', () => {
        localStorage.setItem('mealfit_user_id', UID);
        localStorage.setItem('mealfit_guest_session_id', OTRO_SID);
        localStorage.setItem(AI_CONSENT_STORAGE_KEY, registroDe(SID));
        fijarTitularConsentimientoIA({ uid: UID });
        expect(localStorage.getItem('mealfit_ai_consent_adopcion')).toBeNull();
        expect(localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();
    });
});

describe('[P1-PLAN-LOTE-844 · ronda 1] la analítica y Configuración', () => {
    it('quien escucha el cambio de permiso ya ve la analítica que marcó la hoja', async () => {
        localStorage.setItem('mealfit_user_id', UID);
        getBackendToken.mockResolvedValue('jwt');
        fijarTitularConsentimientoIA({ uid: UID });
        persistAnalyticsOptOut(true);
        fetch.mockResolvedValue(json(200, CON_PERMISO));
        const vistas = [];
        suscribirConsentimientoIA(() => vistas.push(isAnalyticsOptedOut()));
        await aceptarConsentimientoIA({ analytics: true });
        expect(vistas.length).toBeGreaterThan(0);
        expect(vistas.every((optOut) => optOut === false)).toBe(true);
    });

    it('Configuración relee «Ayuda a mejorar» cuando cambia el estado del permiso', () => {
        const src = readFileSync(resolve(__dirname, '../pages/Settings.jsx'), 'utf8');
        expect(src).toContain("import { useConsentimientoIA } from '../consent/consentimientoIA';");
        // [P1-PLAN-LOTE-847] Relee la regla única del permiso previo (`analiticaPermitida`), no el opt-out a secas: con
        // opt-in, «sin opt-out» dejó de significar «encendido».
        expect(src).toMatch(/const permisoIA = useConsentimientoIA\(\);\s*\n\s*useEffect\(\(\) => \{ setAnalyticsEnabled\(analiticaPermitida\(\)\); \}, \[permisoIA\]\);/);
    });
});

describe('[P1-PLAN-LOTE-844 · ronda 1] detalles de la hoja y del panel', () => {
    it('«Activar la IA» del día vacío abre la hoja directamente (sin el aviso de «Ahora no»)', () => {
        const src = readFileSync(resolve(__dirname, '../pages/Dashboard.jsx'), 'utf8');
        const i = src.indexOf("title={t('Activa la IA para completar tu plan')}");
        expect(i).toBeGreaterThan(0);
        const cta = src.slice(i, i + 600);
        expect(cta).toContain('void pedirHojaConsentimientoIA();');
        expect(cta).not.toContain('asegurarConsentimientoIA');
    });

    it('la hoja tiene alto de respaldo en vh antes de cada dvh (iOS 15.0-15.3)', () => {
        const css = readFileSync(resolve(__dirname, '../consent/ConsentimientoIASheet.module.css'), 'utf8');
        const lineas = css.split('\n').map((l) => l.trim());
        const conDvh = lineas.map((l, i) => [l, i]).filter(([l]) => /max-height:[^;]*dvh/.test(l));
        expect(conDvh.length).toBe(2);
        for (const [, i] of conDvh) expect(lineas[i - 1]).toMatch(/^max-height:\s*(min\(90vh, 820px\)|92vh);/);
    });
});
