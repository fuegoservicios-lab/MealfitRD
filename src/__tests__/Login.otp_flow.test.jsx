/**
 * [P2-9 · flujo conductual OTP del Login] El login es EMAIL-OTP (P1-EMAIL-OTP):
 * correo → sendEmailOtp → paso de código → verifyEmailOtpFirstParty. Este flujo
 * (revenue-critical: es la única puerta de entrada con cuenta) tenía cero cobertura
 * conductual — solo la a11y de validación (Login.form_a11y.test.jsx). Aquí fijamos
 * el comportamiento ACTUAL end-to-end a nivel de componente:
 *   1. escribir email + "Continuar con correo" → sendEmailOtp(email) y aparece
 *      el paso de código (hint con el email + input de código enfocado).
 *   2. escribir código + "Entrar" → verifyEmailOtpFirstParty(email, código).
 *   3. backend rechaza el código → banner role=alert visible y el form queda
 *      recuperable (botón re-habilitado, input presente para reintentar).
 *   4. sendEmailOtp falla → permanece en el paso email con alert humanizado
 *      (humanizeAuthError) y botón re-habilitado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../authClient', () => ({
    authClient: {
        auth: {
            signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
            signOut: vi.fn().mockResolvedValue({}),
        },
    },
    sendEmailOtp: vi.fn(),
}));
vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({ session: null, isGuest: false, activateGuestMode: vi.fn(), loadingAuth: false }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../utils/firstPartySession', () => ({
    verifyEmailOtpFirstParty: vi.fn(),
    logoutFirstPartySession: vi.fn(),
}));
vi.mock('../components/auth/PlanShowcase', () => ({ default: () => null }));

import Login from '../pages/Login';
import { sendEmailOtp } from '../authClient';
import { verifyEmailOtpFirstParty } from '../utils/firstPartySession';

const EMAIL = 'usuario@test.do';

/** Render + email + submit → devuelve el input del paso de código. */
async function goToCodeStep(user) {
    render(<MemoryRouter><Login /></MemoryRouter>);
    await user.type(screen.getByLabelText('Correo electrónico'), EMAIL);
    await user.click(screen.getByRole('button', { name: /Continuar con correo/i }));
    return screen.findByLabelText('Código de verificación');
}

describe('Login · flujo conductual email-OTP (P2-9)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sendEmailOtp.mockResolvedValue({ error: null });
        verifyEmailOtpFirstParty.mockResolvedValue({ data: { ok: true }, error: null });
    });

    it('escribir email + enviar → sendEmailOtp(email) y aparece el paso de código', async () => {
        const user = userEvent.setup();
        const codeInput = await goToCodeStep(user);

        expect(sendEmailOtp).toHaveBeenCalledTimes(1);
        expect(sendEmailOtp).toHaveBeenCalledWith(EMAIL);

        // Paso de código visible: hint con el email destino + CTA "Entrar".
        expect(codeInput).toBeInTheDocument();
        expect(screen.getByText(EMAIL)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
        // El input de código recibe focus al entrar al paso (useEffect + ref).
        await waitFor(() => expect(codeInput).toHaveFocus());
        // El paso email ya no está.
        expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument();
    });

    it('escribir código + Entrar → verifyEmailOtpFirstParty(email, código)', async () => {
        const user = userEvent.setup();
        const codeInput = await goToCodeStep(user);

        await user.type(codeInput, '123456');
        await user.click(screen.getByRole('button', { name: 'Entrar' }));

        // Éxito → el componente hace window.location.assign('/') (recarga completa
        // P0-LOGIN-SESSION-PROPAGATE). jsdom no implementa navegación (Location es
        // [LegacyUnforgeable], no-spyable): emite "Not implemented: navigation" en
        // stderr — inofensivo, no falla el test.
        await waitFor(() => {
            expect(verifyEmailOtpFirstParty).toHaveBeenCalledWith(EMAIL, '123456');
        });
        expect(verifyEmailOtpFirstParty).toHaveBeenCalledTimes(1);
    });

    it('backend rechaza el código → role=alert visible y el form queda recuperable', async () => {
        verifyEmailOtpFirstParty.mockResolvedValue({
            error: { message: 'Código inválido o expirado.', status: 401 },
        });
        const user = userEvent.setup();
        const codeInput = await goToCodeStep(user);

        await user.type(codeInput, '000000');
        await user.click(screen.getByRole('button', { name: 'Entrar' }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Código inválido o expirado.');

        // Recuperable: botón re-habilitado (loading=false) e input presente para reintentar.
        expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
        expect(screen.getByLabelText('Código de verificación')).toBeInTheDocument();
        // Sigue en el paso de código (no rebotó al paso email).
        expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument();
    });

    it('sendEmailOtp falla → permanece en el paso email con alert humanizado y botón re-habilitado', async () => {
        sendEmailOtp.mockResolvedValue({ error: { message: 'rate limit exceeded' } });
        const user = userEvent.setup();
        render(<MemoryRouter><Login /></MemoryRouter>);

        await user.type(screen.getByLabelText('Correo electrónico'), EMAIL);
        await user.click(screen.getByRole('button', { name: /Continuar con correo/i }));

        // humanizeAuthError traduce el error crudo a copy es-DO.
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Demasiados intentos');

        // NO avanzó al paso de código y el submit queda re-habilitado.
        expect(screen.queryByLabelText('Código de verificación')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Continuar con correo/i })).toBeEnabled();
    });
});
