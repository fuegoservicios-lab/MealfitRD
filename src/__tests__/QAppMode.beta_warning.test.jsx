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

    it('al seleccionar Modo plan con IA con cuenta activa (isAuth) muestra el modal de advertencia Beta', () => {
        vi.mocked(useAssessment).mockReturnValue({
            formData: { appMode: 'tracking' },
            updateData: mockUpdateData,
            isGuest: false,
        });

        render(<QAppMode onAutoAdvance={mockOnAutoAdvance} />);

        const planCard = screen.getByText('Modo plan con IA');
        fireEvent.click(planCard);

        // [P1-PLAN-LOTE-1116] el aviso pesa: título de fase de pruebas, seis advertencias y la Beta bloqueada
        expect(screen.getByText('El plan con IA está en fase de pruebas')).toBeInTheDocument();
        expect(screen.getByText('Generar un plan tarda varios minutos y a veces falla o se queda a medias.')).toBeInTheDocument();
        expect(screen.getByText('No sustituye a un nutricionista ni a tu médico.')).toBeInTheDocument();
        expect(screen.getByText('Usar el contador (recomendado)')).toBeInTheDocument();
        expect(screen.getByText('Probar el plan Beta de todos modos').closest('button')).toBeDisabled();
        expect(mockOnAutoAdvance).not.toHaveBeenCalled();
    });

    it('elegir "Usar el contador (recomendado)" cambia a tracking y avanza', () => {
        vi.mocked(useAssessment).mockReturnValue({
            formData: { appMode: 'tracking' },
            updateData: mockUpdateData,
            isGuest: false,
        });

        render(<QAppMode onAutoAdvance={mockOnAutoAdvance} />);

        const planCard = screen.getByText('Modo plan con IA');
        fireEvent.click(planCard);

        const btnTracking = screen.getByText('Usar el contador (recomendado)');
        fireEvent.click(btnTracking);

        expect(mockUpdateData).toHaveBeenCalledWith('appMode', 'tracking');
        expect(mockOnAutoAdvance).toHaveBeenCalled();
    });

    it('la Beta solo se puede elegir tras marcar «Entiendo…»; entonces cambia a plan y avanza', () => {
        vi.mocked(useAssessment).mockReturnValue({
            formData: { appMode: 'tracking' },
            updateData: mockUpdateData,
            isGuest: false,
        });

        render(<QAppMode onAutoAdvance={mockOnAutoAdvance} />);

        const planCard = screen.getByText('Modo plan con IA');
        fireEvent.click(planCard);

        const btnPlan = screen.getByText('Probar el plan Beta de todos modos');
        fireEvent.click(btnPlan);
        expect(mockUpdateData).not.toHaveBeenCalled();   // sin marcar la casilla no pasa nada
        fireEvent.click(screen.getByRole('checkbox'));
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

        const planCard = screen.getByText('Modo plan con IA');
        fireEvent.click(planCard);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText('Esta función aún está en fase Beta y no está al 100%.')).not.toBeInTheDocument();
        expect(mockUpdateData).toHaveBeenCalledWith('appMode', 'plan');
        expect(mockOnAutoAdvance).toHaveBeenCalled();
    });
});
