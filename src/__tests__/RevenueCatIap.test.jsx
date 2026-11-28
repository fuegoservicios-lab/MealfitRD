import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
    navigate: vi.fn(),
    refreshProfileAndPlan: vi.fn(async () => {}),
    checkPlanLimit: vi.fn(async () => {}),
    getNativeOfferings: vi.fn(),
    purchaseNativePlan: vi.fn(),
    restoreNativePurchases: vi.fn(),
    initRevenueCat: vi.fn(async () => true),
}));

vi.mock('react-router-dom', async (orig) => ({
    ...(await orig()),
    useNavigate: () => mocks.navigate,
}));

vi.mock('../config/platform', async (orig) => ({
    ...(await orig()),
    isNativeApp: () => true,
    nativePlatform: () => 'ios',
    nativeHidesCommerce: () => true,
    nativeIapAvailable: () => true,
    canShowUpgrade: () => true,
}));

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({
        planData: { days: [{ day: 1 }] },
        upgradeUserPlan: vi.fn(),
        userProfile: { id: 'user-1', plan_tier: 'gratis' },
        isGuest: false,
        session: { user: { id: 'user-1' } },
        refreshProfileAndPlan: mocks.refreshProfileAndPlan,
        checkPlanLimit: mocks.checkPlanLimit,
    }),
}));

vi.mock('../features/billing/revenuecat', () => ({
    initRevenueCat: mocks.initRevenueCat,
    getNativeOfferings: mocks.getNativeOfferings,
    purchaseNativePlan: mocks.purchaseNativePlan,
    restoreNativePurchases: mocks.restoreNativePurchases,
}));

vi.mock('../components/dashboard/PaymentModal', () => ({
    default: () => <div data-testid="paypal-modal-should-not-render" />,
}));

import Upgrade from '../pages/Upgrade';

describe('Upgrade.jsx en modo iOS StoreKit / RevenueCat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getNativeOfferings.mockResolvedValue({
            basic: {
                monthly: { aPackage: { id: 'basic_m' }, productId: 'com.bioboros.basic.monthly', priceString: '$3.99', price: 3.99, currencyCode: 'USD' },
                annual: { aPackage: { id: 'basic_a' }, productId: 'com.bioboros.basic.annual', priceString: '$29.99', price: 29.99, currencyCode: 'USD' },
            },
            plus: {
                monthly: { aPackage: { id: 'plus_m' }, productId: 'com.bioboros.plus.monthly', priceString: '$6.99', price: 6.99, currencyCode: 'USD' },
                annual: { aPackage: { id: 'plus_a' }, productId: 'com.bioboros.plus.annual', priceString: '$49.99', price: 49.99, currencyCode: 'USD' },
            },
            ultra: {
                monthly: { aPackage: { id: 'ultra_m' }, productId: 'com.bioboros.ultra.monthly', priceString: '$11.99', price: 11.99, currencyCode: 'USD' },
                annual: { aPackage: { id: 'ultra_a' }, productId: 'com.bioboros.ultra.annual', priceString: '$89.99', price: 89.99, currencyCode: 'USD' },
            },
        });
        mocks.purchaseNativePlan.mockResolvedValue({ cancelled: false, sync: { active: true, plan_tier: 'plus' } });
        mocks.restoreNativePurchases.mockResolvedValue({ active: true, plan_tier: 'plus' });
    });

    afterEach(() => cleanup());

    it('muestra precios dinámicos de StoreKit, Restaurar compras, textos legales Apple y cero menciones a PayPal', async () => {
        render(<MemoryRouter><Upgrade /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('$3.99')).toBeTruthy();
            expect(screen.getByText('$6.99')).toBeTruthy();
            expect(screen.getByText('$11.99')).toBeTruthy();
        });

        expect(screen.queryByTestId('paypal-modal-should-not-render')).toBeNull();
        expect(screen.queryByText(/PayPal/i)).toBeNull();

        expect(screen.getByRole('button', { name: 'Restaurar compras' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Términos de uso (EULA)' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Política de privacidad' })).toBeTruthy();
        expect(screen.getByText(/se renuevan automáticamente/i)).toBeTruthy();
    });

    it('compra un plan vía purchaseNativePlan, refresca el perfil y navega al dashboard', async () => {
        render(<MemoryRouter><Upgrade /></MemoryRouter>);

        const btnPlus = await screen.findByRole('button', { name: 'Cambiar a Plus' });
        await waitFor(() => expect(btnPlus.disabled).toBe(false));

        fireEvent.click(btnPlus);

        await waitFor(() => {
            expect(mocks.purchaseNativePlan).toHaveBeenCalledTimes(1);
            expect(mocks.refreshProfileAndPlan).toHaveBeenCalledTimes(1);
            expect(mocks.checkPlanLimit).toHaveBeenCalledWith('user-1');
            expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
        });
    });

    it('restaura compras vía restoreNativePurchases', async () => {
        render(<MemoryRouter><Upgrade /></MemoryRouter>);
        const btnRestore = screen.getByRole('button', { name: 'Restaurar compras' });
        fireEvent.click(btnRestore);

        await waitFor(() => {
            expect(mocks.restoreNativePurchases).toHaveBeenCalledTimes(1);
            expect(mocks.refreshProfileAndPlan).toHaveBeenCalledTimes(1);
            expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
        });
    });
});
