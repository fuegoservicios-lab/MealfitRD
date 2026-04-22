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

vi.mock('../supabase', () => ({
    supabase: {}
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
        expect(parentBtn).toBeDisabled();
    });

    it('should show "Nuevo Plan" when plan is expired', () => {
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

        const btn = screen.getByText('Nuevo Plan');
        expect(btn).toBeInTheDocument();
        const parentBtn = btn.closest('button');
        expect(parentBtn).not.toBeDisabled();
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

        // Click on Refrescar btn
        const btn = screen.getByText(/Refrescar/i);
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
