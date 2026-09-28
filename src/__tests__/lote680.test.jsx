/**
 * [P1-PLAN-LOTE-680] Invitados: entrada directa desde el landing (`/probar`) y login en
 * una hoja («Guarda tu plan») cuando el invitado toca algo que pide cuenta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const asm = vi.hoisted(() => ({ value: {} }));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => asm.value }));
vi.mock('../authClient', () => ({
    authClient: { auth: { signInWithOAuth: vi.fn().mockResolvedValue({ error: null }), signOut: vi.fn() } },
    sendEmailOtp: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));
vi.mock('../utils/firstPartySession', () => ({
    verifyEmailOtpFirstParty: vi.fn().mockResolvedValue({ error: null }),
    logoutFirstPartySession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../components/auth/PlanShowcase', () => ({ default: () => null }));
vi.mock('../components/auth/HeroIllustration', () => ({ default: () => null }));

import Login from '../pages/Login';
import ProbarSinCuenta from '../pages/ProbarSinCuenta';
import HojaGuardarPlanHost from '../components/auth/HojaGuardarPlanHost';
import { pedirCuentaInvitado, subscribeHojaGuardarPlan } from '../utils/hojaGuardarPlan';
import { sendEmailOtp } from '../authClient';

const base = { session: null, isGuest: false, planData: null, loadingAuth: false, activateGuestMode: vi.fn() };

beforeEach(() => {
    localStorage.clear();
    asm.value = { ...base, activateGuestMode: vi.fn() };
});

describe('bus pedirCuentaInvitado', () => {
    it('sin host escuchando devuelve false: el llamador conserva su camino de antes', () => {
        expect(pedirCuentaInvitado('cambiar')).toBe(false);
    });

    it('con host entrega el motivo; uno desconocido cae a «guardar»', () => {
        const recibidos = [];
        const baja = subscribeHojaGuardarPlan((m) => recibidos.push(m));
        expect(pedirCuentaInvitado('receta')).toBe(true);
        expect(pedirCuentaInvitado('inventado')).toBe(true);
        baja();
        expect(recibidos).toEqual(['receta', 'guardar']);
        expect(pedirCuentaInvitado('receta')).toBe(false);
    });
});

describe('HojaGuardarPlanHost', () => {
    it('abre la hoja con el login y la frase del motivo, sin «Probar sin cuenta»', async () => {
        asm.value = { ...base, isGuest: true };
        render(<MemoryRouter><HojaGuardarPlanHost /></MemoryRouter>);
        expect(screen.queryByRole('dialog')).toBeNull();
        act(() => { pedirCuentaInvitado('cambiar'); });
        const dialogo = await screen.findByRole('dialog', {}, { timeout: 20000 });
        expect(dialogo).toHaveTextContent('Guarda tu plan');
        expect(dialogo).toHaveTextContent('Crea tu cuenta para cambiar platos con IA');
        expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
        expect(screen.queryByText('Probar sin cuenta')).toBeNull();
    }, 30000);

    it('reabre sola en el paso del código si el invitado volvió de leer el correo', async () => {
        localStorage.setItem('mealfit_guest_mode', '1');
        localStorage.setItem('mf_otp_pending', JSON.stringify({ email: 'a@b.com', sentAt: Date.now() }));
        asm.value = { ...base, isGuest: true };
        render(<MemoryRouter><HojaGuardarPlanHost /></MemoryRouter>);
        expect(await screen.findByLabelText('Código de verificación', {}, { timeout: 20000 })).toBeInTheDocument();
    }, 30000);
});

describe('Login embebido', () => {
    it('el paso del código no empuja historial (la hoja no es una ruta)', async () => {
        const push = vi.spyOn(window.history, 'pushState');
        render(<MemoryRouter><Login embedded /></MemoryRouter>);
        fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'a@b.com' } });
        fireEvent.submit(screen.getByLabelText('Correo electrónico').closest('form'));
        await screen.findByLabelText('Código de verificación');
        expect(sendEmailOtp).toHaveBeenCalledWith('a@b.com');
        expect(push).not.toHaveBeenCalled();
        push.mockRestore();
    });

    it('la pantalla completa sigue ofreciendo «Probar sin cuenta»', () => {
        render(<MemoryRouter><Login /></MemoryRouter>);
        expect(screen.getByText('Probar sin cuenta')).toBeInTheDocument();
    });
});

describe('/probar', () => {
    const montar = () => render(
        <MemoryRouter initialEntries={['/probar']}>
            <Routes>
                <Route path="/probar" element={<ProbarSinCuenta />} />
                <Route path="/assessment" element={<p>formulario</p>} />
                <Route path="/dashboard" element={<p>panel</p>} />
                <Route path="/" element={<p>raiz</p>} />
            </Routes>
        </MemoryRouter>,
    );

    it('visitante nuevo → modo invitado y al formulario', async () => {
        montar();
        expect(await screen.findByText('formulario')).toBeInTheDocument();
        expect(asm.value.activateGuestMode).toHaveBeenCalledTimes(1);
    });

    it('invitado con plan → a su plan, SIN borrarlo', async () => {
        asm.value = { ...base, isGuest: true, planData: { days: [] }, activateGuestMode: vi.fn() };
        montar();
        expect(await screen.findByText('panel')).toBeInTheDocument();
        expect(asm.value.activateGuestMode).not.toHaveBeenCalled();
    });

    it('con sesión → a la app como quien es', async () => {
        asm.value = { ...base, session: { user: { id: 'u1' } }, activateGuestMode: vi.fn() };
        montar();
        await waitFor(() => expect(screen.getByText('raiz')).toBeInTheDocument());
        expect(asm.value.activateGuestMode).not.toHaveBeenCalled();
    });
});
