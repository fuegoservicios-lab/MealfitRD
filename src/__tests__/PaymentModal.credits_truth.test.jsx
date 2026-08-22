/**
 * [P1-CHECKOUT-CREDITS-TRUTH · 2026-08-22] La pantalla de pago anunciaba
 * créditos que ya no existen.
 *
 * LO QUE PASABA
 * `getPlanFeatures` en PaymentModal.jsx tenía los números A MANO, del ladder
 * VIEJO (cuando Gratis eran 15 créditos):
 *
 *     Básico  "3× más que Gratis"          → 50/10  = 5×
 *     Plus    "13× más que Gratis"         → 200/10 = 20×
 *     Max     "Créditos Ilimitados"
 *             "Generación Ilimitada de Planes"  → son 500/mes (auth._TIER_LIMITS)
 *
 * `P1-CREDITS-LADDER` (31-jul) cambió el ladder y actualizó la landing y
 * `/upgrade`, que DERIVAN de `TIER_CREDITS` vía `creditsVsPredecessor`. Esta
 * pantalla no: su comentario `P2-PAYMENT-FEATURES-ALIGN` dice que se alineó con
 * Pricing.jsx, y así fue — en MAYO.
 *
 * El resultado medible: el usuario lee «500 Créditos al mes» en la tarjeta de
 * Max, hace clic, y la pantalla donde pone la tarjeta le promete «ilimitado».
 * Una contradicción dentro del mismo embudo, en el paso del dinero.
 *
 * POR QUÉ ESTE TEST Y NO OTRO
 * No fija los textos: fija que se DERIVEN del SSOT. Un test con los literales
 * dentro sería la misma copia a mano que causó el bug, solo que en `__tests__/`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@paypal/react-paypal-js', () => ({
    PayPalScriptProvider: ({ children }) => children,
    PayPalButtons: () => null,
    FUNDING: { CARD: 'card', PAYPAL: 'paypal' },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import PaymentModal from '../components/dashboard/PaymentModal';
import { TIER_CREDITS, creditsVsPredecessor, includesPredecessor } from '../config/plans';

function renderModal(tier) {
    render(
        <PaymentModal
            isOpen
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            tier={tier}
            price="25.00"
        />
    );
}

describe('[P1-CHECKOUT-CREDITS-TRUTH] el checkout dice la verdad del ladder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('VITE_PAYPAL_CLIENT_ID', 'test-client-id');
    });
    afterEach(() => vi.unstubAllEnvs());

    it.each(['basic', 'plus', 'ultra'])(
        '%s muestra la cifra de créditos que el backend concede de verdad',
        (tier) => {
            renderModal(tier);
            expect(
                screen.getByText(`${TIER_CREDITS[tier]} Créditos de IA al mes`)
            ).toBeInTheDocument();
        }
    );

    it.each(['basic', 'plus', 'ultra'])(
        'el salto de %s se deriva de TIER_CREDITS, no está escrito a mano',
        (tier) => {
            renderModal(tier);
            expect(screen.getByText(creditsVsPredecessor(tier))).toBeInTheDocument();
        }
    );

    it.each(['basic', 'plus', 'ultra'])(
        '%s hereda el escalón anterior con el mismo helper que /upgrade',
        (tier) => {
            renderModal(tier);
            expect(screen.getByText(includesPredecessor(tier))).toBeInTheDocument();
        }
    );

    it('Max ya NO vende «ilimitado» — el backend corta en 500', () => {
        renderModal('ultra');
        expect(document.body.textContent).not.toMatch(/ilimitad/i);
    });

    it.each([
        ['basic', '3× más que Gratis'],
        ['plus', '13× más que Gratis'],
    ])('no queda rastro del múltiplo viejo de %s (ladder gratis=15)', (tier, viejo) => {
        renderModal(tier);
        expect(screen.queryByText(viejo)).toBeNull();
    });
});
