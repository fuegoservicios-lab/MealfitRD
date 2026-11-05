import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QAppMode } from '../components/assessment/questions/QAppMode';
import { useAssessment } from '../context/AssessmentContext';

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: vi.fn(),
}));

describe('QAppMode - Advertencia de versión Beta para el Plan de comidas', () => {
    let mockUpdateData;
    let mockOnAutoAdvance;

    beforeEach(() => {
        localStorage.clear();
        mockUpdateData = vi.fn();
        mockOnAutoAdvance = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('al seleccionar Plan de comidas con IA con cuenta activa (isAuth) muestra el modal de advertencia Beta', () => {
        vi.mocked(useAssessment).mockReturnValue({
            formData: { appMode: 'tracking' },
            updateData: mockUpdateData,
            isGuest: false,
        });

        render(<QAppMode onAutoAdvance={mockOnAutoAdvance} />);

        const planCard = screen.getByText('Plan de comidas con IA');
        fireEvent.click(planCard);

        expect(screen.getByText('Esta función aún está en fase Beta y no está al 100%. Las sugerencias automáticas de recetas y menús pueden requerir ajustes frecuentes.')).toBeInTheDocument();
        expect(screen.getByText('Usar solo el contador (Recomendado)')).toBeInTheDocument();
        expect(screen.getByText('Entendido, probar versión Beta')).toBeInTheDocument();
        expect(mockOnAutoAdvance).not.toHaveBeenCalled();
    });

    it('elegir "Usar solo el contador (Recomendado)" cambia a tracking y avanza', () => {
        vi.mocked(useAssessment).mockReturnValue({
            formData: { appMode: 'tracking' },
            updateData: mockUpdateData,
            isGuest: false,
        });

        render(<QAppMode onAutoAdvance={mockOnAutoAdvance} />);

        const planCard = screen.getByText('Plan de comidas con IA');
        fireEvent.click(planCard);

        const btnTracking = screen.getByText('Usar solo el contador (Recomendado)');
        fireEvent.click(btnTracking);

        expect(mockUpdateData).toHaveBeenCalledWith('appMode', 'tracking');
        expect(mockOnAutoAdvance).toHaveBeenCalled();
    });

    it('elegir "Entendido, probar versión Beta" cambia a plan y avanza', () => {
        vi.mocked(useAssessment).mockReturnValue({
            formData: { appMode: 'tracking' },
            updateData: mockUpdateData,
            isGuest: false,
        });

        render(<QAppMode onAutoAdvance={mockOnAutoAdvance} />);

        const planCard = screen.getByText('Plan de comidas con IA');
        fireEvent.click(planCard);

        const btnPlan = screen.getByText('Entendido, probar versión Beta');
        fireEvent.click(btnPlan);

        expect(mockUpdateData).toHaveBeenCalledWith('appMode', 'plan');
        expect(mockOnAutoAdvance).toHaveBeenCalled();
    });

    it('si el usuario no tiene cuenta (isGuest = true), NO muestra la advertencia y avanza directo al plan', () => {
        vi.mocked(useAssessment).mockReturnValue({
            formData: { appMode: '' },
            updateData: mockUpdateData,
            isGuest: true,
        });

        render(<QAppMode onAutoAdvance={mockOnAutoAdvance} />);

        const planCard = screen.getByText('Plan de comidas con IA');
        fireEvent.click(planCard);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText('Esta función aún está en fase Beta y no está al 100%.')).not.toBeInTheDocument();
        expect(mockUpdateData).toHaveBeenCalledWith('appMode', 'plan');
        expect(mockOnAutoAdvance).toHaveBeenCalled();
    });
});
