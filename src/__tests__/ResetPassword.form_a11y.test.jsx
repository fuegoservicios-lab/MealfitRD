/**
 * [P2-13 · validación de formulario accesible — ResetPassword] Los 2 campos de
 * contraseña se ligan al error (aria-invalid + aria-describedby) para que el lector
 * de pantalla anuncie el campo inválido, no solo un banner de página.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../authClient', () => ({
    authClient: { auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) } },
}));
vi.mock('../utils/checkLeakedPassword', () => ({
    checkLeakedPassword: vi.fn().mockResolvedValue({ leaked: false }),
}));

import ResetPassword from '../pages/ResetPassword';

describe('ResetPassword · a11y de validación de formulario (P2-13)', () => {
    beforeEach(() => {
        // El componente lee el token de window.location.search en un effect de mount;
        // sin token muestra "enlace inválido" (sin form). Lo seteamos para renderizar el form.
        window.history.replaceState(null, '', '/reset-password?token=abc123');
    });

    it('contraseña corta → ambos campos aria-invalid + aria-describedby al error', () => {
        render(<MemoryRouter><ResetPassword /></MemoryRouter>);
        const newPw = screen.getByLabelText(/Nueva Contraseña/i);
        const confirmPw = screen.getByLabelText(/Confirmar Contraseña/i);

        expect(newPw).toHaveAttribute('aria-invalid', 'false');
        expect(newPw).not.toHaveAttribute('aria-describedby');

        // Submit vacío → token OK, passwords iguales (vacías), length < 8 → error.
        fireEvent.submit(newPw.closest('form'));

        const alert = screen.getByRole('alert');
        expect(alert).toHaveAttribute('id', 'reset-error');
        expect(newPw).toHaveAttribute('aria-invalid', 'true');
        expect(newPw).toHaveAttribute('aria-describedby', 'reset-error');
        expect(confirmPw).toHaveAttribute('aria-invalid', 'true');
        expect(confirmPw).toHaveAttribute('aria-describedby', 'reset-error');
    });
});
