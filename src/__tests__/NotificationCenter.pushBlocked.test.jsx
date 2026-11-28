import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
    estadoDeAvisos: vi.fn(),
    navigate: vi.fn(),
}));

vi.mock('react-router-dom', async (orig) => ({
    ...(await orig()),
    useNavigate: () => mocks.navigate,
}));
vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({
        isGuest: false,
        userProfile: { id: 'u1', plan_mode: 'plan' },
        session: { user: { id: 'u1' } },
        formData: {},
        planData: { days: [{ day: 1 }] },
    }),
}));
vi.mock('../utils/avisosDeComida', () => ({
    estadoDeAvisos: () => mocks.estadoDeAvisos(),
}));
vi.mock('../config/platform', () => ({
    nativePlatform: () => 'android',
}));
vi.mock('../components/dashboard/MicronutrientPanel', () => ({
    classify: () => ({}),
    restoreMicrosPanel: () => {},
}));
vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import NotificationCenter from '../components/dashboard/NotificationCenter';

describe('NotificationCenter · aviso de notificaciones bloqueadas', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* noop */ }
        vi.clearAllMocks();
        mocks.estadoDeAvisos.mockResolvedValue({ canal: 'local', activo: false, bloqueado: true });
    });
    afterEach(() => cleanup());

    it('no infla el badge de la campana, muestra cómo reactivarlas y permite descartar o ir a Configuración', async () => {
        render(
            <MemoryRouter>
                <NotificationCenter />
            </MemoryRouter>,
        );

        await act(async () => { await Promise.resolve(); });

        // El badge de la campana sigue limpio (solo cuenta avisos no leídos reales)
        expect(document.querySelector('.handleBadge')).toBeNull();
        const trigger = screen.getByRole('button', { name: /^Notificaciones$/ });

        await act(async () => {
            fireEvent.click(trigger);
        });

        expect(await screen.findByText('Notificaciones bloqueadas')).toBeInTheDocument();
        expect(screen.getByText(/Ajustes → Aplicaciones → Bioboros → Notificaciones/)).toBeInTheDocument();

        const irBtn = screen.getByRole('button', { name: 'Ir a Configuración' });
        fireEvent.click(irBtn);
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard/settings');

        // Reabrir y descartar persiste por cuenta en localStorage
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^Notificaciones$/ }));
        });
        const cerrarAviso = await screen.findByRole('button', { name: 'Ocultar aviso de notificaciones bloqueadas' });
        fireEvent.click(cerrarAviso);
        expect(screen.queryByText('Notificaciones bloqueadas')).not.toBeInTheDocument();
        expect(localStorage.getItem('mealfit_push_blocked_dismissed:u1')).toBe('1');
    });
});
