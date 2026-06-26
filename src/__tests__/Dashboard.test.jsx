import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import Dashboard from '../pages/Dashboard';
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

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

describe('Dashboard Plan Update & Navigation', () => {
    let mockNavigate;
    let mockRegeneratePlan;

    beforeEach(() => {
        mockNavigate = vi.fn();
        mockRegeneratePlan = vi.fn();
        vi.mocked(router.useNavigate).mockReturnValue(mockNavigate);
        
        vi.mocked(useRegeneratePlan).mockReturnValue({
            regeneratePlan: mockRegeneratePlan
        });

        // Mock window.scrollTo
        window.scrollTo = vi.fn();
    });

    it('should disable update button and show "Límite" when planLimit is reached', () => {
        render(<Dashboard />, {
            customContext: {
                planCount: 5,
                userPlanLimit: 5,
            }
        });

        const btn = screen.getByText('Límite');
        expect(btn).toBeInTheDocument();
        const parentBtn = btn.closest('button');
        // El botón ya NO usa el atributo nativo `disabled`; expresa el estado
        // bloqueado vía `aria-disabled={isLimitReached || isDayUpdating}`
        // (interceptando el click en el handler). Aserción equivalente.
        expect(parentBtn).toHaveAttribute('aria-disabled', 'true');
    });

    it('should show "Reiniciar plan" when plan cycle is finished', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 10);

        render(<Dashboard />, {
            customContext: {
                planData: {
                    created_at: pastDate.toISOString(),
                    duration: 'weekly'
                },
                formData: {
                    groceryDuration: 'weekly'
                }
            }
        });

        // [computeCycleStatus] Plan semanal creado hace 10 días con 0 días
        // generados → daysLeft=0 → planFinished=true → el botón primario
        // muestra "Reiniciar plan" (antes "Nuevo Plan"). Clickearlo navega a
        // /assessment para rehacer el ciclo.
        const btn = screen.getByText('Reiniciar plan');
        expect(btn).toBeInTheDocument();
        const parentBtn = btn.closest('button');
        // No está bloqueado: aria-disabled = isLimitReached || isDayUpdating = false.
        expect(parentBtn).toHaveAttribute('aria-disabled', 'false');
    });

    it('should open modal and call regeneratePlan with correct payload when updating active plan (Variety)', async () => {
        const user = userEvent.setup();
        
        render(<Dashboard />, {
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

        // Click on the primary "Actualizar platos" btn (antes "Refrescar"):
        // abre el modal de motivos (showUpdatePlanModal && !isPlanExpired →
        // MotivoActualizarModal).
        const btn = screen.getByText(/Actualizar platos/i);
        await user.click(btn.closest('button'));

        // Click on the variety option
        const varietyOption = screen.getByText(/Quiero más variedad/i);
        await user.click(varietyOption.closest('button'));

        // Verify regeneratePlan was called with correct arguments
        await waitFor(() => {
            expect(mockRegeneratePlan).toHaveBeenCalledWith(expect.objectContaining({
                reason: 'variety',
                isPlanExpired: false
            }));
        });
    });
});
