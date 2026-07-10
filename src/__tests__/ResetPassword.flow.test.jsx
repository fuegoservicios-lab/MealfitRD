/**
 * [P2-9 · flujo conductual de ResetPassword] Cobertura conductual del flujo de
 * cuenta "crear nueva contraseña". OJO characterization: el componente NO usa
 * authClient.auth.updateUser (el adapter de Neon Auth lo rechaza —
 * P1-RESET-PASSWORD-FIX); el path real es
 * authClient.auth.getBetterAuthInstance().resetPassword({ newPassword, token }).
 * Casos fijados:
 *   1. happy path: token en URL + password válida en ambos campos →
 *      resetPassword({newPassword, token}) y mensaje de éxito role=status.
 *   2. password filtrada (HIBP mock leaked+block) → bloquea ANTES de llamar a
 *      resetPassword y muestra el aviso de filtraciones (P2-3).
 *   3. sin token en URL → estado "Enlace inválido o expirado" sin form, con
 *      link de regreso al login.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { resetPasswordMock } = vi.hoisted(() => ({ resetPasswordMock: vi.fn() }));

vi.mock('../authClient', () => ({
    authClient: {
        auth: {
            // El componente valida `typeof getBetterAuthInstance === 'function'`
            // y usa ba.resetPassword — el método soportado por Better Auth.
            getBetterAuthInstance: () => ({ resetPassword: resetPasswordMock }),
        },
    },
}));
vi.mock('../utils/checkLeakedPassword', () => ({
    checkLeakedPassword: vi.fn(),
}));

import ResetPassword from '../pages/ResetPassword';
import { checkLeakedPassword } from '../utils/checkLeakedPassword';

const NEW_PW = 'ClaveSegura#2026';

async function fillAndSubmit(user, pw = NEW_PW) {
    await user.type(screen.getByLabelText(/Nueva Contraseña/i), pw);
    await user.type(screen.getByLabelText(/Confirmar Contraseña/i), pw);
    await user.click(screen.getByRole('button', { name: /Actualizar/i }));
}

describe('ResetPassword · flujo conductual (P2-9)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        checkLeakedPassword.mockResolvedValue({ leaked: false });
        resetPasswordMock.mockResolvedValue({ error: null });
        // El componente lee el token de window.location.search en un effect de mount.
        window.history.replaceState(null, '', '/reset-password?token=abc123');
    });

    it('happy path: token + password válida → resetPassword({newPassword, token}) + éxito role=status', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter><ResetPassword /></MemoryRouter>);

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(resetPasswordMock).toHaveBeenCalledWith({ newPassword: NEW_PW, token: 'abc123' });
        });
        expect(resetPasswordMock).toHaveBeenCalledTimes(1);

        const status = await screen.findByRole('status');
        expect(status).toHaveTextContent(/Contraseña actualizada exitosamente/i);
        // Tras el éxito el submit queda deshabilitado (evita doble submit
        // mientras corre el redirect de 2s a /login).
        expect(screen.getByRole('button', { name: /Actualizar/i })).toBeDisabled();
    });

    it('password filtrada (HIBP block) → bloquea sin llamar resetPassword y muestra el aviso', async () => {
        checkLeakedPassword.mockResolvedValue({ leaked: true, mode: 'block', count: 123456 });
        const user = userEvent.setup();
        render(<MemoryRouter><ResetPassword /></MemoryRouter>);

        await fillAndSubmit(user);

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/filtraciones públicas/i);
        expect(checkLeakedPassword).toHaveBeenCalledWith(NEW_PW);
        expect(resetPasswordMock).not.toHaveBeenCalled();
        // Recuperable: el submit vuelve a habilitarse para reintentar con otra password.
        expect(screen.getByRole('button', { name: /Actualizar/i })).toBeEnabled();
    });

    it('sin token en la URL → estado "Enlace inválido o expirado" sin form', () => {
        window.history.replaceState(null, '', '/reset-password');
        render(<MemoryRouter><ResetPassword /></MemoryRouter>);

        expect(screen.getByRole('heading', { name: /Enlace inválido o expirado/i })).toBeInTheDocument();
        // No hay form de password — solo el CTA de regreso al login.
        expect(screen.queryByLabelText(/Nueva Contraseña/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Actualizar/i })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Volver al inicio de sesión/i })).toBeInTheDocument();
    });
});
