import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import Settings from '../pages/Settings';
import * as router from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: vi.fn(),
    };
});

vi.mock('../hooks/useRegeneratePlan', () => ({
    useRegeneratePlan: vi.fn()
}));

vi.mock('../supabase', () => ({
    supabase: {}
}));

describe('Settings Plan Regeneration', () => {
    let mockNavigate;
    let mockRegeneratePlan;

    beforeEach(() => {
        mockNavigate = vi.fn();
        mockRegeneratePlan = vi.fn();
        vi.mocked(router.useNavigate).mockReturnValue(mockNavigate);
        
        vi.mocked(useRegeneratePlan).mockReturnValue({
            regeneratePlan: mockRegeneratePlan
        });

        window.scrollTo = vi.fn();
    });

    it('should open modal and call regeneratePlan with correct payload when "Evaluar de Nuevo" is clicked (Renovar)', async () => {
        const user = userEvent.setup();
        
        render(<Settings />, {
            customContext: {
                planData: {
                    created_at: new Date().toISOString(),
                    duration: 'weekly',
                    days: [{ meals: [] }]
                },
                formData: {
                    groceryDuration: 'weekly'
                }
            }
        });

        // [APPEARANCE-THEME · 2026-05-28] Ajustes se dividió en secciones de
        // sidebar (refactor P3-PROFILE-*): "Evaluar de Nuevo" vive en la
        // sección "Plan & Objetivo", que NO es la sección por defecto
        // ('profile'). Navegamos a ella vía el botón del sidebar antes de
        // buscar el botón. (matchMedia mock → desktop → arranca en 'profile'.)
        const planNavItem = screen.getByText('Plan & Objetivo');
        await user.click(planNavItem.closest('button'));

        // Click on "Evaluar de Nuevo"
        const evaluarBtn = screen.getByText(/Evaluar de Nuevo/i);
        await user.click(evaluarBtn);

        // Modal should open
        expect(screen.getByRole('heading', { name: /Evaluar de Nuevo/i })).toBeInTheDocument();

        // Select Renovar option
        const renovarOption = screen.getByText(/Renovar Plan Actual/i);
        await user.click(renovarOption.closest('button'));

        // Verify regeneratePlan was called.
        // [APPEARANCE-THEME · 2026-05-28] El handler 'renovar' ahora pasa
        // props extra ({ toastId, entry_point: 'settings_renovar' }) además de
        // { reason, isPlanExpired }. `toastId` es un id dinámico de sonner, así
        // que asertamos con objectContaining sobre el contrato estable en vez
        // de un match exacto.
        await waitFor(() => {
            expect(mockRegeneratePlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    reason: 'variety',
                    isPlanExpired: false,
                    entry_point: 'settings_renovar',
                })
            );
        });
    });
});
