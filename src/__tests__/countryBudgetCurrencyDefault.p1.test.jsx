/**
 * [P1-COUNTRY-BUDGET-CURRENCY-DEFAULT · 2026-08-23]
 *
 * Prueba de EFECTO con el AssessmentProvider y los dos pasos reales: elegir país
 * en QCountry, avanzar y observar la moneda que QBudget deja activa y usa en el
 * hint. Esto incluye el default real de AssessmentContext; una réplica que
 * empezara con budgetCurrency='' daría un falso verde aunque producción siguiera
 * sembrando DOP.
 */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

vi.mock('../authClient', () => ({
    authClient: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
            getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            signOut: vi.fn().mockResolvedValue({ error: null }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../utils/firstPartySession', () => ({
    checkFirstPartySession: vi.fn().mockResolvedValue(null),
    mintFirstPartySession: vi.fn().mockResolvedValue(null),
    logoutFirstPartySession: vi.fn().mockResolvedValue(undefined),
    adoptOAuthVerifierFirstParty: vi.fn().mockResolvedValue(false),
    FORM_KEY_READY_EVENT: 'mealfit-form-key-ready',
}));

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    restorePlanFromHistory: vi.fn().mockResolvedValue({ ok: false }),
    getPlanChunkStatus: vi.fn().mockResolvedValue(null),
}));

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../config/countries', async () => {
    const actual = await vi.importActual('../config/countries');
    return { ...actual, COUNTRY_SYSTEM_UI: true };
});

vi.mock('../hooks/useBudgetFloor', () => ({
    useBudgetFloor: () => ({
        min: 50,
        isPersonalized: false,
        tierReferences: { low: 100, medium: 125, high: 175 },
    }),
}));

import { AssessmentProvider } from '../context/AssessmentContext';
import { QCountry } from '../components/assessment/questions/QCountry';
import { QBudget } from '../components/assessment/questions/QBudget';
import {
    COUNTRIES,
    defaultCurrencyForCountry,
} from '../config/countries';
import { effectiveBudgetCurrency } from '../config/formValidation';


function WizardCountryThenBudget() {
    const [step, setStep] = useState('country');
    return step === 'country'
        ? <QCountry onAutoAdvance={() => setStep('budget')} />
        : <QBudget onAutoAdvance={() => {}} />;
}


const CASES = [
    { country: 'ES', pressed: 'EUR', hint: /EUR|€/u },
    { country: 'US', pressed: 'US$', hint: /US\$|USD/u },
    { country: 'CO', pressed: 'COP', hint: /COP/u },
];


beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
        resolvedOptions: () => ({ timeZone: 'Asia/Tokyo' }),
    }));
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
});


describe('[P1-COUNTRY-BUDGET-CURRENCY-DEFAULT] QCountry → QBudget', () => {
    for (const row of CASES) {
        it(`${row.country} activa su moneda y el hint no queda en RD$`, async () => {
            const { container } = render(
                <AssessmentProvider>
                    <WizardCountryThenBudget />
                </AssessmentProvider>,
            );

            fireEvent.click(container.querySelector(`input[name="country"][value="${row.country}"]`));

            await waitFor(() => {
                const lowTier = container.querySelector('input[name="budget"][value="low"]')?.closest('label');
                expect(lowTier?.textContent).toMatch(row.hint);
                expect(lowTier?.textContent).not.toContain('RD$');
            });

            fireEvent.click(container.querySelector('input[name="budget"][value="custom"]'));
            await waitFor(() => {
                const activeCurrency = container.querySelector('[aria-label="Moneda del presupuesto"] button[aria-pressed="true"]');
                expect(activeCurrency?.textContent).toBe(row.pressed);
            });
        });
    }

    it('Settings queda cubierto por derivación: cambiar sólo country basta con moneda ausente', () => {
        for (const row of CASES) {
            expect(effectiveBudgetCurrency(row.country, '', true)).toBe(
                defaultCurrencyForCountry(row.country),
            );
        }
    });

    it('el SSOT declara moneda para cada país y nunca duplica el botón USD', () => {
        expect(COUNTRIES.every((country) => Boolean(country.currency))).toBe(true);
        expect(COUNTRIES.find((country) => country.code === 'US')?.currency).toBe('USD');
        expect(COUNTRIES.find((country) => country.code === 'PR')?.currency).toBe('USD');
    });
});
