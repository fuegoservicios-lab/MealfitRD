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

        // Click on "Evaluar de Nuevo"
        const evaluarBtn = screen.getByText(/Evaluar de Nuevo/i);
        await user.click(evaluarBtn);

        // Modal should open
        expect(screen.getByRole('heading', { name: /Evaluar de Nuevo/i })).toBeInTheDocument();

        // Select Renovar option
        const renovarOption = screen.getByText(/Renovar Plan Actual/i);
        await user.click(renovarOption.closest('button'));

        // Verify regeneratePlan was called
        await waitFor(() => {
            expect(mockRegeneratePlan).toHaveBeenCalledWith({
                reason: 'variety',
                isPlanExpired: false
            });
        });
    });
});
