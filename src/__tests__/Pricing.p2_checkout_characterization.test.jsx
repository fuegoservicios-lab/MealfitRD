/**
 * [P2-CHECKOUT-PLANCARD · 2026-08-14 · paso 1 de 2] La red que faltaba antes de
 * tocar la única superficie que factura.
 *
 * `Pricing.jsx` (515 líneas) duplica de `Upgrade.jsx` la máquina de checkout
 * entera —`handleUpgradeClick`, `closePayment`, `handlePaymentSuccess`, el efecto
 * mount-only que rehidrata `?checkout=<tier>&billing=`, los helpers de precio,
 * `getButtonText`, `isButtonDisabled`— y escribe sus 4 tarjetas longhand mientras
 * `Upgrade` ya extrajo `renderPlanCard`.
 *
 * ⚠️ PERO NO HAY NI UN TEST QUE MONTE ESTE COMPONENTE. Cero. Sobre el camino que
 * cobra, y que acumula al menos cuatro P-fixes de comportamiento
 * (P5-SPEED-PAYMENTMODAL-LAZY, PAY-MODAL-PERSIST, P1-PAY-LIMBO,
 * P1-GUEST-PRICING/P1-PRICING-ANON-LOADING).
 *
 * Refactorizar primero y probar después habría sido cambiar deuda de
 * mantenimiento por riesgo de regresión EN EL COBRO. Estos son tests de
 * caracterización: fijan lo que el componente hace HOY —pasan contra el código
 * actual, sin tocarlo— para que la extracción de `<PlanCard>` sea verificable en
 * vez de esperanzada.
 *
 * Lo que fijan es lo que un refactor presentacional puede romper sin darse
 * cuenta: los estados de carga (que deciden si el botón dice "Cargando…" o
 * "Empezar gratis"), la rehidratación desde la URL tras un refresh, y que las 4
 * tarjetas conserven su copy DISTINTO — parametrizar no es promediar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// El modal de pago es lazy y arrastra el SDK de PayPal: fuera del banco.
// La prop es `tier` suelta, no un objeto `plan`: el mock tiene que hablar el
// idioma real del componente o "no se abre" y "se abre con el plan equivocado"
// se ven exactamente igual.
vi.mock('../components/dashboard/PaymentModal', () => ({
    default: ({ tier }) => <div data-testid="payment-modal">{tier || 'sin-tier'}</div>,
}));

const estadoAssessment = {
    session: null,
    userProfile: null,
    loadingAuth: false,
    isGuest: false,
    hasStarted: false,
};

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => estadoAssessment,
}));

import Pricing from '../components/home/Pricing';

const pintar = (ruta = '/precios') =>
    render(
        <MemoryRouter initialEntries={[ruta]}>
            <Pricing />
        </MemoryRouter>,
    );

beforeEach(() => {
    Object.assign(estadoAssessment, {
        session: null, userProfile: null, loadingAuth: false, isGuest: false, hasStarted: false,
    });
});

describe('[P2-CHECKOUT-PLANCARD] las cuatro tarjetas y su copy propio', () => {
    it('pinta los cuatro planes', () => {
        pintar();
        for (const nombre of ['Gratis', 'Básico', 'Plus', 'Max']) {
            expect(screen.getAllByText(new RegExp(nombre, 'i')).length).toBeGreaterThan(0);
        }
    });

    it('cada plan de pago muestra SU precio, no un precio promediado', () => {
        // El riesgo concreto de extraer un componente compartido: unificar de más.
        pintar();
        const texto = document.body.textContent;
        expect(texto).toContain('9.99');
        expect(texto).toContain('19.99');
        expect(texto).toContain('49.99');
    });

    it('los CTA de los cuatro planes NO son el mismo texto', () => {
        // «Parametrizar, no promediar»: si el refactor colapsa los rótulos, esto cae.
        pintar();
        const botones = screen.getAllByRole('button')
            .map((b) => b.textContent.trim())
            .filter(Boolean);
        expect(new Set(botones).size).toBeGreaterThan(1);
    });
});

describe('[P2-CHECKOUT-PLANCARD] estados de carga del perfil', () => {
    it('mientras la auth resuelve, los CTA dicen que están cargando', () => {
        estadoAssessment.loadingAuth = true;
        pintar();
        expect(document.body.textContent).toMatch(/Cargando/i);
    });

    it('con sesión pero sin perfil hidratado sigue en carga', () => {
        // [P1-PRICING-ANON-LOADING] La distinción que costó un P-fix: sin sesión NO
        // es "cargando" (es un anónimo, y su CTA es definitivo); con sesión y sin
        // perfil, sí.
        estadoAssessment.session = { user: { id: 'u1' } };
        estadoAssessment.userProfile = null;
        pintar();
        expect(document.body.textContent).toMatch(/Cargando/i);
    });

    it('un ANÓNIMO no ve "Cargando": su CTA es definitivo', () => {
        estadoAssessment.session = null;
        estadoAssessment.loadingAuth = false;
        pintar();
        expect(document.body.textContent).not.toMatch(/Cargando/i);
    });
});

describe('[P2-CHECKOUT-PLANCARD] rehidratación del checkout desde la URL', () => {
    it('sin ?checkout no abre ningún modal', () => {
        pintar('/precios');
        expect(screen.queryByTestId('payment-modal')).toBeNull();
    });

    it('con ?checkout=<tier> reabre el modal del MISMO plan tras un refresh', async () => {
        // [PAY-MODAL-PERSIST] El efecto mount-only que lee searchParams por closure.
        // Es exactamente el tipo de cosa que una extracción descuidada deja fuera.
        estadoAssessment.session = { user: { id: 'u1' } };
        estadoAssessment.userProfile = { id: 'u1', plan_tier: 'gratis' };
        pintar('/precios?checkout=plus&billing=monthly');
        // `findBy*` y no `queryBy*`: el modal vive bajo `<Suspense fallback={null}>`
        // porque su chunk es lazy (P5-SPEED-PAYMENTMODAL-LAZY). En el primer render
        // suspende y no hay NADA en el DOM — indistinguible de "no se abrio" si se
        // consulta en sincrono.
        const modal = await screen.findByTestId('payment-modal');
        expect(within(modal).getByText('plus')).toBeTruthy();
    });
});
