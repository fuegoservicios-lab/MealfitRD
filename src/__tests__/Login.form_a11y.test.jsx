/**
 * [P2-13 · validación de formulario accesible] Los forms de auth anunciaban solo
 * un banner role=alert a nivel de página; el input no se ligaba al error, así que
 * un usuario de lector de pantalla oía un error genérico sin saber QUÉ campo falló.
 * Fix: el error tiene id; el input activo lleva aria-invalid + aria-describedby → el
 * lector anuncia el campo como inválido y lee el mensaje.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../authClient', () => ({
    authClient: {
        auth: {
            signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        },
    },
    sendEmailOtp: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({ session: null, isGuest: false, activateGuestMode: vi.fn(), loadingAuth: false }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../utils/firstPartySession', () => ({
    verifyEmailOtpFirstParty: vi.fn().mockResolvedValue({ error: null }),
    logoutFirstPartySession: vi.fn(),
}));
vi.mock('../components/auth/PlanShowcase', () => ({ default: () => null }));

import Login from '../pages/Login';

describe('Login · a11y de validación de formulario (P2-13)', () => {
    it('email vacío → input aria-invalid + aria-describedby ligado al error', () => {
        render(<MemoryRouter><Login /></MemoryRouter>);
        const emailInput = screen.getByLabelText('Correo electrónico');

        // Estado inicial: sin error.
        expect(emailInput).toHaveAttribute('aria-invalid', 'false');
        expect(emailInput).not.toHaveAttribute('aria-describedby');

        // Submit con email vacío → setError('Ingresa tu correo electrónico').
        fireEvent.submit(emailInput.closest('form'));

        const alert = screen.getByRole('alert');
        expect(alert).toHaveAttribute('id', 'login-error');
        expect(emailInput).toHaveAttribute('aria-invalid', 'true');
        expect(emailInput).toHaveAttribute('aria-describedby', 'login-error');
    });
});
