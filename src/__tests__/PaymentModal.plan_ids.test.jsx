/**
 * [P2-9 · guard fail-loud de PLAN_IDS del PaymentModal] Los plan IDs de PayPal
 * son env-only SIN fallback hardcodeado (P2-PAYPAL-PLAN-FAIL-LOUD): si el env var
 * falta, handleCreateSubscription DEBE abortar con toast.error + Promise.reject
 * (jamás crear una suscripción contra un plan equivocado/vacío). Se inspecciona
 * la prop `createSubscription` que PaymentModal pasa al stub de PayPalButtons.
 * OJO: Vitest carga `.env` (que define VITE_PAYPAL_PLAN_* reales), así que el
 * caso "ausente" stubbea a '' TANTO el key *_MONTHLY como el fallback legacy.
 * Casos fijados:
 *   1. plan id ausente → createSubscription rechaza + toast.error, sin llamar
 *      a actions.subscription.create.
 *   2. mensual presente → payload {plan_id} correcto, sin `plan` (no re-pricea
 *      sin cupón) y sin toast.
 *   3. isAnnual → usa el key *_ANNUAL.
 *   4. *_MONTHLY vacío pero legacy VITE_PAYPAL_PLAN_<TIER> presente → cae al
 *      fallback legacy (characterization del `||`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const { capturedPayPalProps } = vi.hoisted(() => ({ capturedPayPalProps: [] }));

vi.mock('@paypal/react-paypal-js', () => ({
    PayPalScriptProvider: ({ children }) => children,
    // Captura las props para invocar createSubscription desde el test.
    PayPalButtons: (props) => {
        capturedPayPalProps.push(props);
        return null;
    },
    FUNDING: { CARD: 'card', PAYPAL: 'paypal' },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import PaymentModal from '../components/dashboard/PaymentModal';
import { toast } from 'sonner';

function renderModal(props = {}) {
    render(
        <PaymentModal
            isOpen
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            tier="plus"
            price="25.00"
            {...props}
        />
    );
    // PaymentModal solo monta el PayPalButtons del método activo ('card' default);
    // .at(-1) toma las props del último render.
    return capturedPayPalProps.at(-1);
}

describe('PaymentModal · PLAN_IDS env-only fail-loud (P2-9)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedPayPalProps.length = 0;
        vi.stubEnv('VITE_PAYPAL_CLIENT_ID', 'test-client-id');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('plan id AUSENTE → createSubscription rechaza + toast.error, sin llamar a PayPal', async () => {
        vi.stubEnv('VITE_PAYPAL_PLAN_PLUS_MONTHLY', '');
        vi.stubEnv('VITE_PAYPAL_PLAN_PLUS', ''); // fallback legacy también ausente
        const paypalProps = renderModal();
        const create = vi.fn();

        await expect(
            paypalProps.createSubscription({}, { subscription: { create } })
        ).rejects.toThrow('Missing PayPal plan ID');

        expect(toast.error).toHaveBeenCalledWith('Plan de pago no configurado. Contacta soporte.');
        expect(create).not.toHaveBeenCalled();
    });

    it('env var mensual presente → payload con el plan_id correcto (y sin re-pricing sin cupón)', async () => {
        vi.stubEnv('VITE_PAYPAL_PLAN_PLUS_MONTHLY', 'P-TEST-PLUS-MONTHLY');
        const paypalProps = renderModal();
        const create = vi.fn().mockResolvedValue('SUB-123');

        await expect(
            paypalProps.createSubscription({}, { subscription: { create } })
        ).resolves.toBe('SUB-123');

        expect(create).toHaveBeenCalledTimes(1);
        const payload = create.mock.calls[0][0];
        expect(payload.plan_id).toBe('P-TEST-PLUS-MONTHLY');
        // Sin cupón aplicado NO se inyecta billing_cycles con precio custom.
        expect(payload).not.toHaveProperty('plan');
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('isAnnual → usa el plan id ANUAL (VITE_PAYPAL_PLAN_PLUS_ANNUAL)', async () => {
        vi.stubEnv('VITE_PAYPAL_PLAN_PLUS_ANNUAL', 'P-TEST-PLUS-ANNUAL');
        const paypalProps = renderModal({ isAnnual: true });
        const create = vi.fn().mockResolvedValue('SUB-ANNUAL');

        await paypalProps.createSubscription({}, { subscription: { create } });

        expect(create.mock.calls[0][0].plan_id).toBe('P-TEST-PLUS-ANNUAL');
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('*_MONTHLY vacío pero legacy presente → cae al fallback VITE_PAYPAL_PLAN_PLUS', async () => {
        vi.stubEnv('VITE_PAYPAL_PLAN_PLUS_MONTHLY', '');
        vi.stubEnv('VITE_PAYPAL_PLAN_PLUS', 'P-TEST-PLUS-LEGACY');
        const paypalProps = renderModal();
        const create = vi.fn().mockResolvedValue('SUB-LEGACY');

        await paypalProps.createSubscription({}, { subscription: { create } });

        expect(create.mock.calls[0][0].plan_id).toBe('P-TEST-PLUS-LEGACY');
        expect(toast.error).not.toHaveBeenCalled();
    });
});
