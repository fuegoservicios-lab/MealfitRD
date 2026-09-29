/**
 * [P1-PLAN-LOTE-844 · 2026-09-29] El host de la hoja «Tus datos y la IA», montado en la raíz de la app.
 *
 *  - Cuentas que ya existían: si `profile.ai_consent` dice que falta, la hoja sale SOLA una vez al abrir la app, dentro
 *    de la app (no en el login ni en las legales), y no a quien lo retiró.
 *  - Cualquier petición (`asegurarConsentimientoIA`, un 428) la dibuja, con sesión o de invitado; aceptar la cierra.
 *  - Está montado en App.jsx, perezoso y fuera del apex, como sus vecinos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as contexto from '../context/AssessmentContext';
import ConsentimientoIAHost from '../consent/ConsentimientoIAHost';
import { fetchWithAuth } from '../config/api';
import {
    _reiniciarConsentimientoIAParaTests,
    estadoConsentimientoIA,
    pedirHojaConsentimientoIA,
} from '../consent/consentimientoIA';
import { AI_CONSENT_VERSION } from '../consent/version';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const SIN_PERMISO = { version: AI_CONSENT_VERSION, vigente: false, ai_consent_version: null, ai_consent_at: null, ai_cn_transfer_at: null, ai_consent_revoked_at: null, analytics: null };
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
let n = 0;
const uidNuevo = () => `aaaaaaaa-0000-0000-0000-${String(++n).padStart(12, '0')}`;

const montar = ({ ruta = '/dashboard', uid = null, invitado = false, aiConsent } = {}) => {
    vi.spyOn(contexto, 'useAssessment').mockReturnValue({
        session: uid ? { user: { id: uid } } : null,
        isGuest: invitado,
        userProfile: uid ? { id: uid, ai_consent: aiConsent } : null,
        refreshProfileAndPlan: vi.fn(),
        updateData: vi.fn(),
    });
    if (uid) localStorage.setItem('mealfit_user_id', uid);
    return render(<MemoryRouter initialEntries={[ruta]}><ConsentimientoIAHost /></MemoryRouter>);
};

beforeEach(() => {
    _reiniciarConsentimientoIAParaTests();
    localStorage.clear();
    fetchWithAuth.mockReset();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('[P1-PLAN-LOTE-844] la hoja sale sola al abrir la app (cuentas que ya existían)', () => {
    it('una cuenta a la que aún no se le preguntó la ve dentro de la app; «Ahora no» la cierra', async () => {
        montar({ uid: uidNuevo(), aiConsent: SIN_PERMISO });
        expect(screen.queryByRole('dialog')).toBeNull();   // un respiro: primero se pinta la pantalla
        const hoja = await screen.findByRole('dialog', {}, { timeout: 4000 });
        expect(hoja.textContent).toContain('Tus datos y la IA');
        expect(estadoConsentimientoIA()).toMatchObject({ tipo: 'cuenta', vigente: false });
        fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(localStorage.getItem('mealfit_ai_consent_snooze')).toContain(AI_CONSENT_VERSION);
    });

    it('no sale en el login ni a quien retiró el permiso', async () => {
        montar({ ruta: '/login', uid: uidNuevo(), aiConsent: SIN_PERMISO });
        await new Promise((r) => setTimeout(r, 1700));
        expect(screen.queryByRole('dialog')).toBeNull();
        cleanup();
        _reiniciarConsentimientoIAParaTests();
        montar({ uid: uidNuevo(), aiConsent: { ...SIN_PERMISO, ai_consent_version: AI_CONSENT_VERSION, ai_consent_at: '2026-09-29T10:00:00Z', ai_consent_revoked_at: '2026-09-29T11:00:00Z' } });
        await new Promise((r) => setTimeout(r, 1700));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('con el permiso vigente no sale', async () => {
        montar({ uid: uidNuevo(), aiConsent: { ...SIN_PERMISO, vigente: true, ai_consent_version: AI_CONSENT_VERSION, ai_consent_at: '2026-09-29T10:00:00Z' } });
        await new Promise((r) => setTimeout(r, 1700));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(estadoConsentimientoIA()).toMatchObject({ vigente: true });
    });
});

describe('[P1-PLAN-LOTE-844] la hoja pedida', () => {
    it('al invitado se le dibuja cuando una acción la pide; aceptar la anota y la cierra', async () => {
        localStorage.setItem('mealfit_user_id', 'guest');
        localStorage.setItem('mealfit_guest_session_id', 'sesion-invitado-1234');
        montar({ ruta: '/assessment', invitado: true });
        let decision;
        act(() => { decision = pedirHojaConsentimientoIA(); });
        const hoja = await screen.findByRole('dialog');
        expect(hoja.closest('.ph-no-capture')).not.toBeNull();
        fetchWithAuth.mockResolvedValue(respuesta({ ok: true, version: AI_CONSENT_VERSION }));
        fireEvent.click(screen.getByLabelText(/use mis datos de salud para crear mi plan/));
        fireEvent.click(screen.getByLabelText(/se envíen a DeepSeek, en China/));
        fireEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
        await expect(decision).resolves.toBe(true);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(fetchWithAuth.mock.calls[0][0]).toBe('/api/consents/guest');
    });
});

describe('[P1-PLAN-LOTE-844] montado en la raíz de la app', () => {
    it('cuelga del host de la raíz (HojaGuardarPlanHost, perezoso, fuera del apex), siempre montado', () => {
        const app = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8').replace(/\s+/g, ' ');
        // [ronda 1] No en App.jsx: un lazy() más escribía en el arranque la lista de trozos del host.
        expect(app).not.toContain('ConsentimientoIAHost');
        expect(app).toContain("const HojaGuardarPlanHost = lazy(() => import('./components/auth/HojaGuardarPlanHost'));");
        expect(app).toContain('{!IS_APEX_HOST && ( <Suspense fallback={null}> <HojaGuardarPlanHost /> </Suspense> )}');
        // Fuera de las rutas: sirve igual en el formulario, /plan, el panel, el chat y el escáner.
        expect(app.indexOf('<HojaGuardarPlanHost />')).toBeLessThan(app.indexOf('<ModalAwareRoutes>'));
        const host = readFileSync(resolve(__dirname, '../components/auth/HojaGuardarPlanHost.jsx'), 'utf8').replace(/\s+/g, ' ');
        expect(host).toContain("const ConsentimientoIAHost = lazy(() => import('../../consent/ConsentimientoIAHost'));");
        expect(host).toContain('if (!hojaPedida) return hostDelPermisoIA;');
        expect(host).toContain('{hostDelPermisoIA} <Suspense fallback={null}> <HojaGuardarPlan');
    });
});
