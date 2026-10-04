/**
 * [P1-PLAN-LOTE-844 · 2026-09-29] Configuración → Privacidad → «IA de terceros».
 *
 *  - Con el permiso dado: la versión y la fecha aceptadas, y «Retirar mi permiso» con confirmación (POST /withdraw).
 *    Retirar no borra la cuenta; si el servidor pausó el plan, la app pasa a modo contador (como en Capacidades).
 *  - Sin permiso: «Activar la IA» abre la hoja.
 *  - «Ayuda a mejorar» y la casilla de analítica de la hoja son el MISMO dato: el interruptor lo anota en la cuenta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as contexto from '../context/AssessmentContext';
import BloqueIADeTerceros from '../consent/BloqueIADeTerceros';
import { fetchWithAuth } from '../config/api';
import { confirmToast } from '../utils/confirmToast';
import { toast } from 'sonner';
import {
    _reiniciarConsentimientoIAParaTests,
    fijarTitularConsentimientoIA,
    sincronizarConsentimientoIADesdePerfil,
    suscribirHojaConsentimientoIA,
} from '../consent/consentimientoIA';
import { guardarAnaliticaEnServidor } from '../consent/apiConsentimiento';
import { AI_CONSENT_VERSION } from '../consent/version';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../utils/confirmToast', () => ({ confirmToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const UID = '11111111-2222-3333-4444-555555555555';
const SIN_PERMISO = { version: AI_CONSENT_VERSION, vigente: false, ai_consent_version: null, ai_consent_at: null, ai_cn_transfer_at: null, ai_consent_revoked_at: null, analytics: null };
const CON_PERMISO = { ...SIN_PERMISO, vigente: true, ai_consent_version: AI_CONSENT_VERSION, ai_consent_at: '2026-09-29T15:00:00+00:00', ai_cn_transfer_at: '2026-09-29T15:00:00+00:00', analytics: false };
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

let ctx;
const montar = (estado) => {
    ctx = { planData: null, refreshProfileAndPlan: vi.fn(async () => {}), updateData: vi.fn() };
    vi.spyOn(contexto, 'useAssessment').mockReturnValue(ctx);
    localStorage.setItem('mealfit_user_id', UID);
    fijarTitularConsentimientoIA({ uid: UID });
    sincronizarConsentimientoIADesdePerfil(UID, estado);
    fetchWithAuth.mockImplementation(async (url) => (String(url) === '/api/consents' ? respuesta(estado) : respuesta({})));
    return render(<BloqueIADeTerceros />);
};

beforeEach(() => {
    _reiniciarConsentimientoIAParaTests();
    localStorage.clear();
    fetchWithAuth.mockReset();
    confirmToast.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('[P1-PLAN-LOTE-844] el bloque «IA de terceros»', () => {
    it('con permiso: versión y fecha aceptadas, a quién van los datos, y el botón de retirar', async () => {
        montar(CON_PERMISO);
        expect(screen.getByRole('heading', { name: 'IA de terceros' })).toBeTruthy();
        expect(screen.getByText('Permiso activo')).toBeTruthy();
        expect(screen.getByText(/^Aceptado el .*2026 · versión ia-2026-10-voz$/)).toBeTruthy();
        const bloque = screen.getByTestId('bloque-ia-de-terceros');
        expect(bloque.className).toContain('ph-no-capture');
        for (const p of ['DeepSeek (China)', 'OpenAI', 'Google Gemini', 'Cohere']) expect(bloque.textContent).toContain(p);
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledWith('/api/consents'));   // relee al abrir
    });

    it('retirar pide confirmación; si se cancela no sale nada', async () => {
        montar(CON_PERMISO);
        confirmToast.mockResolvedValue(false);
        fireEvent.click(screen.getByRole('button', { name: 'Retirar mi permiso' }));
        await waitFor(() => expect(confirmToast).toHaveBeenCalledTimes(1));
        expect(confirmToast.mock.calls[0][0]).toBe('¿Retirar tu permiso para la IA?');
        expect(confirmToast.mock.calls[0][1]).toMatchObject({ danger: true, confirmLabel: 'Retirar permiso' });
        expect(fetchWithAuth.mock.calls.filter(([u]) => String(u).includes('/withdraw'))).toEqual([]);
    });

    it('confirmado: POST /withdraw; queda «Permiso retirado», la app pasa a contador y se ofrece activarla de nuevo', async () => {
        montar(CON_PERMISO);
        confirmToast.mockResolvedValue(true);
        const retirado = { ...CON_PERMISO, vigente: false, ai_consent_revoked_at: '2026-09-30T10:00:00+00:00', plan_pausado: true };
        fetchWithAuth.mockImplementation(async (url) => {
            if (String(url) === '/api/consents/withdraw') return respuesta(retirado);
            if (String(url) === '/api/consents') return respuesta(CON_PERMISO);
            return respuesta({});
        });
        fireEvent.click(screen.getByRole('button', { name: 'Retirar mi permiso' }));
        await waitFor(() => expect(screen.getByText('Permiso retirado')).toBeTruthy());
        const retirada = fetchWithAuth.mock.calls.find(([u]) => u === '/api/consents/withdraw');
        expect(retirada[1].method).toBe('POST');
        expect(toast.success).toHaveBeenCalledWith('Listo. Ya no enviaremos tus datos a la IA.', {
            description: 'Pausamos la generación de tu plan; la app queda como contador.',
        });
        expect(localStorage.getItem('mealfit_plan_mode')).toBe('tracking');
        expect(ctx.updateData).toHaveBeenCalledWith('appMode', 'tracking');
        await waitFor(() => expect(ctx.refreshProfileAndPlan).toHaveBeenCalled());
        expect(screen.getByRole('button', { name: 'Activar la IA' })).toBeTruthy();
        expect(screen.getByText(/^Lo retiraste el .*2026\./)).toBeTruthy();
    });

    it('sin permiso: «Activar la IA» abre la hoja', async () => {
        montar(SIN_PERMISO);
        const host = vi.fn();
        suscribirHojaConsentimientoIA(host);
        expect(screen.getByText('Sin permiso')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Activar la IA' }));
        expect(host).toHaveBeenLastCalledWith({ automatica: false });
    });
});

describe('[P1-PLAN-LOTE-844] Configuración lo monta y «Ayuda a mejorar» es el mismo dato', () => {
    const SETTINGS = readFileSync(resolve(__dirname, '../pages/Settings.jsx'), 'utf8');

    it('el bloque vive en la sección Privacidad', () => {
        const privacidad = SETTINGS.slice(SETTINGS.indexOf("activeSection === 'privacy' && ("), SETTINGS.indexOf("activeSection === 'plan' && ("));
        expect(privacidad).toContain('<BloqueIADeTerceros />');
        expect(privacidad.indexOf('<BloqueIADeTerceros />')).toBeLessThan(privacidad.indexOf("{t('Preferencias')}"));
    });

    it('el interruptor anota la analítica en la cuenta, fuera del updater de estado', () => {
        const i = SETTINGS.indexOf('const handleToggleAnalytics = () => {');
        const cuerpo = SETTINGS.slice(i, SETTINGS.indexOf('\n    };', i));
        const anotar = cuerpo.indexOf('guardarAnaliticaEnServidor(!analyticsEnabled)');
        expect(anotar).toBeGreaterThan(-1);
        expect(anotar).toBeLessThan(cuerpo.indexOf('setAnalyticsEnabled((prev) =>'));
    });

    it('lo que manda es solo la analítica, con la versión vigente', async () => {
        fetchWithAuth.mockResolvedValue(respuesta({ ...CON_PERMISO, analytics: true }));
        await guardarAnaliticaEnServidor(true);
        const [url, opts] = fetchWithAuth.mock.calls[0];
        expect(url).toBe('/api/consents');
        const cuerpo = JSON.parse(opts.body);
        expect(cuerpo).toMatchObject({ version: AI_CONSENT_VERSION, analytics: true });
        expect(cuerpo.ai_processing).toBeUndefined();
        expect(cuerpo.ai_transfer_cn).toBeUndefined();
    });
});
