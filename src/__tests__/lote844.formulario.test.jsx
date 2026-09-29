/**
 * [P1-PLAN-LOTE-844 · 2026-09-29] El camino del revisor de Apple en una instalación limpia: «Probar sin cuenta» →
 * formulario → «Finalizar y Generar». La hoja del permiso sale ANTES de navegar a /plan (donde el perfil de salud sale
 * hacia la IA). Con «Ahora no» no se navega; aceptando, primero se anota el permiso del invitado y después se navega.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from './utils/test-utils';
import InteractiveAssessmentFlow from '../components/assessment/InteractiveAssessmentFlow';
import { REQUIRED_FORM_FIELDS } from '../config/formValidation';
import { fetchWithAuth } from '../config/api';
import { toast } from 'sonner';
import {
    _reiniciarConsentimientoIAParaTests,
    aceptarConsentimientoIA,
    fijarTitularConsentimientoIA,
    rechazarConsentimientoIA,
    suscribirHojaConsentimientoIA,
} from '../consent/consentimientoIA';
import { AI_CONSENT_STORAGE_KEY } from '../consent/version';

const { navegar } = vi.hoisted(() => ({ navegar: vi.fn() }));
vi.mock('react-router-dom', async () => {
    const real = await vi.importActual('react-router-dom');
    return { ...real, useNavigate: () => navegar };
});
vi.mock('../config/api', async (importOriginal) => ({ ...(await importOriginal()), fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

const SID = 'sesion-invitado-1234';
const _ARRAYS = new Set(['allergies', 'dislikes', 'medicalConditions', 'struggles', 'cultureProfiles']);
const FORM_COMPLETO = Object.fromEntries(REQUIRED_FORM_FIELDS.map((c) => [c, _ARRAYS.has(c) ? ['Ninguna'] : 'x']));

const contexto = (currentStep) => ({
    currentStep, maxReachedStep: currentStep, planData: null, formData: FORM_COMPLETO,
    setCurrentStep: vi.fn(), nextStep: vi.fn(), prevStep: vi.fn(), updateData: vi.fn(), resetApp: vi.fn(),
    exitGuestSession: vi.fn(), loadingSensitive: false, isGuest: true, userProfile: null, session: null,
});

/** Monta el formulario en su ÚLTIMO paso (el total se lee del contador, no se clava). */
const montarEnElFinal = () => {
    const { unmount } = render(<InteractiveAssessmentFlow />, { customContext: contexto(0) });
    const m = document.body.textContent.match(/PASO\s+\d+\s+DE\s+(\d+)/i);
    expect(m, 'no se encontró el contador «PASO N DE M»').toBeTruthy();
    unmount();
    render(<InteractiveAssessmentFlow />, { customContext: contexto(Number(m[1]) - 1) });
    return screen.getByRole('button', { name: /Finalizar y Generar/i });
};

beforeEach(() => {
    _reiniciarConsentimientoIAParaTests();
    localStorage.clear();
    localStorage.setItem('mealfit_user_id', 'guest');
    localStorage.setItem('mealfit_guest_session_id', SID);
    fijarTitularConsentimientoIA({ invitado: true });
    navegar.mockReset();
    fetchWithAuth.mockReset();
    toast.info.mockReset();
});
afterEach(() => cleanup());

describe('[P1-PLAN-LOTE-844] «Finalizar y Generar» espera el permiso', () => {
    it('con «Ahora no» NO navega a /plan (ni sale nada) y avisa «Activa la IA para usar esto»', async () => {
        suscribirHojaConsentimientoIA((p) => { if (p) queueMicrotask(() => rechazarConsentimientoIA()); });
        fireEvent.click(montarEnElFinal());
        await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Activa la IA para usar esto', expect.any(Object)));
        expect(navegar).not.toHaveBeenCalledWith('/plan');
        // Solo puede haber salido la telemetría propia del formulario: ni el permiso ni nada hacia la IA.
        const rutas = fetchWithAuth.mock.calls.map(([u]) => String(u));
        expect(rutas.filter((u) => !u.includes('/telemetry/'))).toEqual([]);
    });

    it('aceptando: primero se anota el permiso del invitado (con su session_id) y DESPUÉS se navega a /plan', async () => {
        fetchWithAuth.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
        suscribirHojaConsentimientoIA((p) => {
            if (p) queueMicrotask(() => {
                expect(navegar).not.toHaveBeenCalledWith('/plan');   // la hoja está abierta: todavía no
                void aceptarConsentimientoIA({ analytics: false });
            });
        });
        fireEvent.click(montarEnElFinal());
        await waitFor(() => expect(navegar).toHaveBeenCalledWith('/plan'));
        const permiso = fetchWithAuth.mock.calls.find(([u]) => u === '/api/consents/guest');
        expect(permiso, 'el permiso del invitado no se anotó').toBeTruthy();
        expect(JSON.parse(permiso[1].body)).toMatchObject({ session_id: SID, ai_processing: true, ai_transfer_cn: true });
        expect(JSON.parse(localStorage.getItem(AI_CONSENT_STORAGE_KEY))).toMatchObject({ quien: `invitado:${SID}` });
    });
});
