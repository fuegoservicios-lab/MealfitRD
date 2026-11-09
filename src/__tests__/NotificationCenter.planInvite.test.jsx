import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({
        isGuest: false,
        userProfile: { id: 'u1', plan_mode: 'tracking' },
        session: { user: { id: 'u1' } },
        formData: {},
        planData: null, // modo contador
        updateData: vi.fn(),
    }),
}));
vi.mock('../components/dashboard/MicronutrientPanel', () => ({ classify: () => ({}), restoreMicrosPanel: () => {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ visible: true, dismissed: false }) }) }));
vi.mock('../utils/planModeResume', () => ({ reanudarPlanes: vi.fn() }));

import NotificationCenter from '../components/dashboard/NotificationCenter';

describe('NotificationCenter false-positive prevention (BB-052)', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* noop */ }
    });
    afterEach(() => cleanup());

    it('no muestra badge ni contador falso en la campana cuando no hay notificaciones reales', () => {
        render(
            <MemoryRouter>
                <NotificationCenter />
            </MemoryRouter>
        );

        // La campana existe pero no tiene badge con texto '1'
        const badge = document.querySelector('.handleBadge');
        expect(badge).toBeNull();

        // El botón accesible no dice "1 sin leer"
        const trigger = screen.getByRole('button', { name: /^Notificaciones$/ });
        expect(trigger).toBeDefined();
    });

    it('al abrir el drawer en modo contador, muestra la opción de encender plan y mensaje de no otras notificaciones', async () => {
        render(
            <MemoryRouter>
                <NotificationCenter />
            </MemoryRouter>
        );

        const trigger = screen.getByRole('button', { name: /^Notificaciones$/ });
        await act(async () => {
            fireEvent.click(trigger);
        });

        // La tarjeta de encender el plan está visible dentro del drawer
        expect(screen.getByText('¿Quieres que la IA te arme el plan?')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Encender el plan' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'Ahora no' })).toBeDefined();

        // Muestra aviso de que no hay otras notificaciones pendientes
        expect(screen.getByText('No tienes otras notificaciones pendientes.')).toBeDefined();
    });
});
