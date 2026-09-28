// [P1-PLAN-LOTE-792 · ronda 1 de revisión] En un mercado beta el piso ORIENTA: el paso deja seguir y el plan se
// genera (`pisoSoloOrienta` + `_piso_solo_orienta` del backend). QBudget seguía diciendo «Súbelo para poder crear un
// plan viable.» con role="alert" y aria-invalid — falso en ES/MX/CO desde el 23-ago y, con el lote 792, también
// en US y PR. Aquí se monta el paso y se lee lo que el usuario (y su lector de pantalla) recibe.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const estado = { formData: {}, updateData: vi.fn() };
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => estado }));
vi.mock('../hooks/useBudgetFloor', () => ({
    useBudgetFloor: () => ({ min: 80, isPersonalized: false, tierReferences: null }),
}));
vi.mock('../config/countries', async () => {
    const actual = await vi.importActual('../config/countries');
    return { ...actual, COUNTRY_SYSTEM_UI: true };
});

import { QBudget } from '../components/assessment/questions/QBudget';

const SUBELO = 'Súbelo para poder crear un plan viable.';
const PUEDES_SEGUIR = 'Puedes seguir y crear tu plan con este monto.';

function montar(country, budgetAmount) {
    estado.formData = {
        country, budget: 'custom', budgetCurrency: 'USD', budgetAmount,
        groceryDuration: 'weekly', _budgetFloorMin: 80,
    };
    const { container } = render(<QBudget onAutoAdvance={() => {}} />);
    return {
        ayuda: container.querySelector('#budgetAmountHelp'),
        monto: container.querySelector('#budgetAmount'),
    };
}

afterEach(() => cleanup());

describe('lote 792 · QBudget no promete un bloqueo que no existe', () => {
    it.each(['US', 'PR', 'CO'])('%s (mercado beta) con 70 USD: orienta, sin alerta ni campo inválido', (pais) => {
        const { ayuda, monto } = montar(pais, '70');
        expect(ayuda.textContent).not.toContain(SUBELO);
        expect(ayuda.textContent).toContain(PUEDES_SEGUIR);
        expect(ayuda.textContent).toContain('Como referencia, el mínimo para 7 días es');
        expect(ayuda.getAttribute('role')).toBeNull();
        expect(monto.getAttribute('aria-invalid')).toBeNull();
    });

    it('DO (mercado con precios) con 70 USD: sigue bloqueando y lo dice', () => {
        const { ayuda, monto } = montar('DO', '70');
        expect(ayuda.textContent).toContain(SUBELO);
        expect(ayuda.textContent).not.toContain(PUEDES_SEGUIR);
        expect(ayuda.getAttribute('role')).toBe('alert');
        expect(monto.getAttribute('aria-invalid')).toBe('true');
    });

    it('por encima del mínimo, en cualquier mercado, la ayuda de siempre', () => {
        for (const pais of ['US', 'DO']) {
            const { ayuda } = montar(pais, '120');
            expect(ayuda.textContent).toContain('La IA ajustará los ingredientes para acercarse a este monto.');
            expect(ayuda.textContent).not.toContain(PUEDES_SEGUIR);
            cleanup();
        }
    });
});
