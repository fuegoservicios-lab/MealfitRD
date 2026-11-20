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
import { TIER_CREDITS, TIER_LIMITS } from '../config/plans';

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

    // [P1-PLAN-LOTE-1116 · 2026-11-20] Lo que incluye cada plan son sus TOPES reales; la regla de este test sigue:
    // las cifras se DERIVAN del SSOT (`TIER_CREDITS` / `TIER_LIMITS`, paridad con el servidor), nunca a mano.
    it.each(['basic', 'plus', 'ultra'])(
        '%s muestra los planes con IA que el backend concede de verdad',
        (tier) => {
            renderModal(tier);
            expect(screen.getByText(`${TIER_CREDITS[tier]} planes con IA al mes (Beta)`)).toBeInTheDocument();
        }
    );

    it.each(['basic', 'plus', 'ultra'])(
        '%s muestra sus topes de fotos, coach y voz desde TIER_LIMITS',
        (tier) => {
            renderModal(tier);
            const l = TIER_LIMITS[tier];
            const texto = document.body.textContent.replace(/[  ,.]/g, '');
            expect(texto).toContain(`${l.fotos_dia} fotos analizadas al día`);
            expect(texto).toContain(`${l.coach_mes} mensajes con el coach al mes`);
            expect(texto).toContain(`${l.voz_min_mes} min de voz en vivo al mes`);
        }
    );

    it('Max NO vende «ilimitado» — el backend corta', () => {
        renderModal('ultra');
        expect(document.body.textContent).not.toMatch(/ilimitad/i);
    });

    it.each(['basic', 'plus', 'ultra'])('no queda rastro de los «Créditos de IA» del ladder viejo en %s', (tier) => {
        renderModal(tier);
        expect(document.body.textContent).not.toMatch(/Créditos de IA al mes/);
    });
});
