import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QAppMode } from '../components/assessment/questions/QAppMode';
import { useAssessment } from '../context/AssessmentContext';

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: vi.fn(),
}));

describe('QAppMode - Selección directa de modo sin advertencia modal', () => {
    let mockUpdateData;
    let mockOnAutoAdvance;

    beforeEach(() => {
        localStorage.clear();
        mockUpdateData = vi.fn();
        mockOnAutoAdvance = vi.fn();
        vi.mocked(useAssessment).mockReturnValue({
            formData: { appMode: 'tracking' },
            updateData: mockUpdateData,
            isGuest: false,
        });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('al seleccionar Plan de comidas con IA avanza directamente sin bloquear con modal', () => {
        render(<QAppMode onAutoAdvance={mockOnAutoAdvance} />);

        const planCard = screen.getByText('Plan de comidas con IA');
        fireEvent.click(planCard);

        expect(mockUpdateData).toHaveBeenCalledWith('appMode', 'plan');
        expect(mockOnAutoAdvance).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
