// [P3-CREDITS-LAST-ONE · 2026-09-02] Último crédito: señal secundaria, no cambio de color.
// Decisión de diseño (dueño, 2026-09-02): ámbar mientras aún se puede generar; rojo solo en 0.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CreditsMeter from '../components/dashboard/CreditsMeter.jsx';

const badge = () => screen.getByRole('img');

describe('CreditsMeter: último crédito', () => {
    it('con 1 de 10 muestra «Último crédito», sigue en ámbar (low) y marca la clase', () => {
        render(<CreditsMeter remainingCredits={1} userPlanLimit={10} isLimitReached={false} />);
        expect(screen.getByText('Último crédito')).toBeTruthy();
        expect(badge().className).toMatch(/low/);
        expect(badge().className).toMatch(/lastCredit/);
        expect(badge().className).not.toMatch(/depleted/);
    });
    it('con 2 de 10 mantiene «Créditos» sin la señal', () => {
        render(<CreditsMeter remainingCredits={2} userPlanLimit={10} isLimitReached={false} />);
        expect(screen.getByText('Créditos')).toBeTruthy();
        expect(badge().className).not.toMatch(/lastCredit/);
    });
    it('con 0 pasa a rojo (depleted) y NO es «último crédito»', () => {
        render(<CreditsMeter remainingCredits={0} userPlanLimit={10} isLimitReached={true} />);
        expect(badge().className).toMatch(/depleted/);
        expect(badge().className).not.toMatch(/lastCredit/);
    });
    it('el invitado con 1 de 1 no recibe la señal (estado guest)', () => {
        render(<CreditsMeter remainingCredits={1} userPlanLimit={1} isLimitReached={false} isGuest />);
        expect(badge().className).not.toMatch(/lastCredit/);
        expect(screen.getByText('Prueba')).toBeTruthy();
    });
});
