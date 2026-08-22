/**
 * [P1-BILLING-ORPHAN-RECOVERY · 2026-08-22] La mitad de cliente: estampar
 * `custom_id` al crear la suscripción.
 *
 * POR QUÉ
 * `POST /api/subscription/verify` era el ÚNICO camino por el que una
 * suscripción de PayPal llegaba a `user_profiles`, y lo dispara el NAVEGADOR
 * desde `onApprove`. Si entre la aprobación y esa llamada se cae la red, el
 * usuario cierra la pestaña, o `/verify` devuelve 500/409, PayPal cobra y el
 * sistema no se entera: `paypal_subscription_id` queda NULL y los webhooks
 * (`ACTIVATED`, `PAYMENT.SALE.COMPLETED`) filtran justo por esa columna → 0
 * filas, no-op silencioso. Cobro sin acceso y sin alerta.
 *
 * Con `custom_id` en el `create`, PayPal nos devuelve el user_id FIRMADO dentro
 * del webhook, y el backend puede adoptar al huérfano sin depender de que el
 * navegador sobreviva. Ver `backend/tests/test_p1_billing_orphan_recovery.py`.
 *
 * LA TRAMPA QUE ESTE TEST CIERRA
 * Que la prop exista pero nadie la pase. Esa es la forma exacta de la feature
 * INERTE que ya se pagó dos veces en este repo, así que aquí se comprueban las
 * DOS mitades: el payload y el cableado de las dos superficies que abren
 * checkout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { capturedPayPalProps } = vi.hoisted(() => ({ capturedPayPalProps: [] }));

vi.mock('@paypal/react-paypal-js', () => ({
    PayPalScriptProvider: ({ children }) => children,
    PayPalButtons: (props) => {
        capturedPayPalProps.push(props);
        return null;
    },
    FUNDING: { CARD: 'card', PAYPAL: 'paypal' },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import PaymentModal from '../components/dashboard/PaymentModal';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.join(_dir, '..', rel), 'utf-8');

function createdPayload(props = {}) {
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
    const create = vi.fn();
    capturedPayPalProps.at(-1).createSubscription({}, { subscription: { create } });
    expect(create).toHaveBeenCalledTimes(1);
    return create.mock.calls[0][0];
}

describe('[P1-BILLING-ORPHAN-RECOVERY] custom_id en el create', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedPayPalProps.length = 0;
        vi.stubEnv('VITE_PAYPAL_CLIENT_ID', 'test-client-id');
        vi.stubEnv('VITE_PAYPAL_PLAN_PLUS_MONTHLY', 'P-PLUS-TEST');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('estampa el user_id para que un /verify perdido siga siendo recuperable', () => {
        const payload = createdPayload({ userId: 'user-abc-123' });
        expect(payload.custom_id).toBe('user-abc-123');
    });

    it('sin userId NO manda la clave (PayPal guardaría un "undefined" inútil)', () => {
        const payload = createdPayload({});
        expect(payload).not.toHaveProperty('custom_id');
    });

    it('el plan_id sigue mandándose igual: custom_id no reemplaza nada', () => {
        const payload = createdPayload({ userId: 'user-abc-123' });
        expect(payload.plan_id).toBe('P-PLUS-TEST');
    });

    it.each([
        ['components/home/Pricing.jsx'],
        ['pages/Upgrade.jsx'],
    ])('%s CABLEA la prop (si no, la feature nace inerte)', (rel) => {
        const code = src(rel);
        const modal = code.slice(code.indexOf('<PaymentModal'));
        expect(modal.slice(0, modal.indexOf('/>'))).toMatch(/userId=\{/);
    });
});
