/**
 * [P2-9 · comportamiento del PaymentModal] Surface de pago (revenue-critical)
 * sin cobertura conductual. Se mockea SOLO el SDK de PayPal (stubs no-focusables),
 * sonner y fetchWithAuth; el hook useModalAccessibility corre REAL para que el
 * focus trap sea el de producción. Casos fijados:
 *   1. render con isOpen → dialog con tier/precio correctos (Plan Plus, US$25.00,
 *      features del tier).
 *   2. focus trap real: el foco inicial entra al contenedor (tabIndex=-1) y
 *      Tab desde el último focusable cicla al primero (y Shift+Tab al revés).
 *   3. ESC → onClose (disableClose=false: el usuario puede abortar el checkout).
 *   4. cupón: escribir código + Aplicar → POST /api/discount/validate con
 *      {code, tier} y el desglose refleja el descuento del mock (50% → US$12.50).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@paypal/react-paypal-js', () => ({
    // Stubs sin focusables: los bordes del focus trap quedan determinísticos
    // (el iframe real de PayPal no participa del trap en jsdom).
    PayPalScriptProvider: ({ children }) => children,
    PayPalButtons: () => null,
    FUNDING: { CARD: 'card', PAYPAL: 'paypal' },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import PaymentModal from '../components/dashboard/PaymentModal';
import { fetchWithAuth } from '../config/api';

function renderModal(props = {}) {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(
        <PaymentModal
            isOpen
            onClose={onClose}
            onSuccess={onSuccess}
            tier="plus"
            price="25.00"
            {...props}
        />
    );
    return { onClose, onSuccess };
}

describe('PaymentModal · comportamiento (P2-9)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Fail-loud P3-NEW-PAYPAL-FALLBACK: sin client_id el render throwea.
        vi.stubEnv('VITE_PAYPAL_CLIENT_ID', 'test-client-id');
        fetchWithAuth.mockResolvedValue({
            json: async () => ({
                valid: true,
                discount_percent: 50,
                message: 'Cupón aplicado: 50% de descuento.',
            }),
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('render con isOpen → dialog con tier y precio correctos', () => {
        renderModal();

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby', 'payment-modal-title');

        expect(screen.getByRole('heading', { name: 'Plan Plus' })).toBeInTheDocument();
        expect(screen.getByText('Suscripción Mensual')).toBeInTheDocument();
        // Precio en la línea de suscripción Y en el total (sin descuento).
        expect(screen.getAllByText('US$25.00')).toHaveLength(2);
        // Feature del tier plus (PLAN_FEATURES espeja Pricing.jsx).
        expect(screen.getByText('200 Créditos de IA al mes')).toBeInTheDocument();
    });

    it('focus trap REAL: foco inicial al contenedor; Tab desde el último cicla al primero', async () => {
        renderModal();
        const dialog = screen.getByRole('dialog');

        // useModalAccessibility enfoca el contenedor tras un setTimeout(10).
        await waitFor(() => expect(dialog).toHaveFocus());

        const user = userEvent.setup();
        const closeBtn = screen.getByRole('button', { name: 'Cerrar ventana modal' });
        const couponInput = screen.getByPlaceholderText('Ej: LAUNCH50');

        // Último focusable del modal = input de cupón ("Aplicar" está disabled
        // con cupón vacío → excluido del selector del trap). Tab → primero.
        couponInput.focus();
        await user.tab();
        expect(closeBtn).toHaveFocus();

        // Shift+Tab desde el primer focusable vuelve al último — no escapa al fondo.
        await user.tab({ shift: true });
        expect(couponInput).toHaveFocus();
    });

    it('ESC → onClose (el usuario puede abortar antes del submit)', async () => {
        const { onClose } = renderModal();
        await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());

        const user = userEvent.setup();
        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('cupón: aplicar → POST /api/discount/validate {code, tier} y el precio final refleja el descuento', async () => {
        const user = userEvent.setup();
        renderModal();

        await user.type(screen.getByPlaceholderText('Ej: LAUNCH50'), 'LAUNCH50');
        await user.click(screen.getByRole('button', { name: 'Aplicar' }));

        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        const [url, opts] = fetchWithAuth.mock.calls[0];
        expect(url).toBe('/api/discount/validate');
        expect(opts.method).toBe('POST');
        expect(JSON.parse(opts.body)).toEqual({ code: 'LAUNCH50', tier: 'plus' });

        // Feedback del cupón + desglose con descuento del mock (50% de 25.00).
        expect(await screen.findByText('Cupón aplicado: 50% de descuento.')).toBeInTheDocument();
        expect(screen.getByText('Descuento (50%)')).toBeInTheDocument();
        expect(screen.getByText('-US$12.50')).toBeInTheDocument();
        // Total "Monto a pagar hoy" pasa a mostrar el precio final.
        expect(screen.getByText('US$12.50')).toBeInTheDocument();
        // La línea original de suscripción sigue mostrando el precio base.
        expect(screen.getByText('US$25.00')).toBeInTheDocument();
    });
});
