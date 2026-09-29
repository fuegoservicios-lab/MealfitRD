/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] Lo que se promete sobre los créditos, igual que lo que hace el backend.
 *
 *   · El FAQ de /upgrade prometía prorrateo y una renovación «el día de tu fecha de inicio». El backend cuenta desde
 *     el día 1 del mes natural (`get_monthly_api_usage`) y subir de plan es una suscripción NUEVA a precio completo;
 *     la anterior se cancela sin devolver nada.
 *   · El medidor pintaba ∞ / «Créditos ilimitados» para cualquier límite que no fuera `number`. Ningún plan de pago es
 *     ilimitado (Max = 500/mes); el centinela queda solo para la cuenta `admin`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CreditsMeter from '../components/dashboard/CreditsMeter.jsx';

const medidor = () => screen.getByRole('img');

describe('[718] CreditsMeter: finito salvo el admin', () => {
    it('Max (500) se pinta con su número', () => {
        render(<CreditsMeter remainingCredits={420} userPlanLimit={500} isLimitReached={false} />);
        expect(screen.getByText('420')).toBeInTheDocument();
        expect(screen.getByText('/ 500')).toBeInTheDocument();
        expect(screen.queryByText('∞')).toBeNull();
        expect(medidor()).toHaveAttribute('aria-label', '420 de 500 créditos restantes');
    });

    it('un límite numérico que llega como texto sigue siendo un número (no ∞)', () => {
        render(<CreditsMeter remainingCredits="12" userPlanLimit="500" isLimitReached={false} />);
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('/ 500')).toBeInTheDocument();
        expect(screen.queryByText('∞')).toBeNull();
    });

    it('un límite ilegible NO promete ilimitado', () => {
        render(<CreditsMeter remainingCredits={3} userPlanLimit={undefined} isLimitReached={false} />);
        expect(screen.queryByText('∞')).toBeNull();
        expect(medidor().getAttribute('aria-label')).not.toMatch(/ilimitados/i);
    });

    it('el centinela del admin sigue siendo ∞', () => {
        render(<CreditsMeter remainingCredits="∞" userPlanLimit="Ilimitado" isLimitReached={false} />);
        expect(screen.getByText('∞')).toBeInTheDocument();
        expect(medidor()).toHaveAttribute('aria-label', 'Créditos ilimitados');
    });
});

describe('[718] el FAQ de /upgrade dice lo que hace el backend', () => {
    const upgrade = readFileSync(resolve(__dirname, '..', 'pages', 'Upgrade.jsx'), 'utf8');
    it('renovación el día 1 y sin prorrateo', () => {
        expect(upgrade).toContain('Tus créditos se renuevan el día 1 de cada mes.');
        expect(upgrade).toContain('sin prorrateo ni reembolso de lo ya pagado');
        expect(upgrade).not.toContain('la diferencia se prorratea');
        expect(upgrade).not.toContain('el día de tu fecha de inicio');
    });
});
