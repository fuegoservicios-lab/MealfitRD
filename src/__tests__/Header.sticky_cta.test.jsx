/* [HEADER-STICKY-CTA · 2026-05-31] El Header del landing revela un CTA "Crear mi
 * Plan Ahora" cuando el CTA del Hero sale de vista al hacer scroll, y lo oculta al
 * volver arriba. La señal viaja por HeroCtaContext (heroCtaVisible). Aquí mockeamos
 * ese contexto para verificar la lógica de visibilidad del Header sin depender del
 * IntersectionObserver real del Hero. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from './utils/test-utils';
import { MemoryRouter } from 'react-router-dom';
import Header from '../components/layout/Header';
import * as heroCtaModule from '../context/HeroCtaContext';

const mockHeroCta = (heroCtaVisible) => {
    vi.spyOn(heroCtaModule, 'useHeroCta').mockReturnValue({
        heroCtaVisible,
        setHeroCtaVisible: vi.fn(),
    });
};

describe('[HEADER-STICKY-CTA] CTA sticky del header en el landing', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('en home, NO muestra el CTA sticky mientras el del Hero está visible', () => {
        mockHeroCta(true); // CTA del Hero en pantalla
        render(<Header />, { customContext: { planData: null, session: null } });
        expect(screen.queryByText('Crear mi Plan Ahora')).not.toBeInTheDocument();
    });

    it('en home, REVELA el CTA sticky cuando el del Hero sale de vista', () => {
        mockHeroCta(false); // CTA del Hero fuera de pantalla (scrolled)
        render(<Header />, { customContext: { planData: null, session: null } });
        const cta = screen.getByText('Crear mi Plan Ahora');
        expect(cta).toBeInTheDocument();
        expect(cta.closest('a')).toHaveAttribute('href', '/assessment');
    });

    it('con plan activo, el CTA sticky refleja "Ver mi Plan" → /dashboard', () => {
        mockHeroCta(false);
        render(<Header />, { customContext: { planData: { id: 'plan-1' }, session: null } });
        const cta = screen.getByText('Ver mi Plan');
        expect(cta).toBeInTheDocument();
        expect(cta.closest('a')).toHaveAttribute('href', '/dashboard');
    });

    it('fuera del landing (p.ej. /privacy) NUNCA aparece, aunque el Hero esté fuera de vista', () => {
        mockHeroCta(false);
        render(<Header />, {
            customContext: { planData: null, session: null },
            wrapper: ({ children }) => (
                <MemoryRouter initialEntries={['/privacy']}>{children}</MemoryRouter>
            ),
        });
        expect(screen.queryByText('Crear mi Plan Ahora')).not.toBeInTheDocument();
    });

    it('el menú de cuenta va DESPUÉS del CTA del plan en el DOM (CTA a la izquierda, cuenta a la derecha)', () => {
        // [ACCOUNT-MENU · 2026-06-01] "Configuración" + "Cerrar Sesión" se fusionaron
        // en un menú de cuenta (avatar + chevron). Home + sesión + plan + scrolleado:
        // conviven el CTA sticky ("Ver mi Plan") y el trigger del menú de cuenta. El
        // usuario pidió el CTA a la izquierda y los controles de cuenta a la derecha.
        // Sin CSS `order`, el orden del DOM == orden visual en el cluster.
        mockHeroCta(false);
        render(<Header />, {
            customContext: { planData: { id: 'plan-1' }, session: { user: { id: 'u-1', email: 'a@b.com' } } },
        });
        const cta = screen.getByText('Ver mi Plan').closest('a');
        const accountBtn = screen.getByLabelText('Abrir menú de cuenta');
        expect(cta).toBeTruthy();
        expect(accountBtn).toBeTruthy();
        // El menú de cuenta DEBE seguir al CTA en el documento (CTA primero = izquierda).
        // eslint-disable-next-line no-bitwise
        const accountFollowsCta = cta.compareDocumentPosition(accountBtn) & Node.DOCUMENT_POSITION_FOLLOWING;
        expect(accountFollowsCta).toBeTruthy();
    });

    it('[ACCOUNT-MENU] fusiona "Configuración" + "Cerrar Sesión" en un menú desplegable', () => {
        // Cerrado por defecto: ninguna de las dos acciones ocupa espacio en el header.
        mockHeroCta(true); // sin CTA sticky → en el cluster solo vive el trigger de cuenta
        render(<Header />, {
            customContext: { planData: { id: 'plan-1' }, session: { user: { id: 'u-1', email: 'a@b.com' } } },
        });
        expect(screen.queryByText('Configuración')).not.toBeInTheDocument();
        expect(screen.queryByText('Cerrar Sesión')).not.toBeInTheDocument();
        // Al abrir el menú, ambas acciones aparecen agrupadas.
        fireEvent.click(screen.getByLabelText('Abrir menú de cuenta'));
        const config = screen.getByText('Configuración');
        expect(config).toBeInTheDocument();
        expect(config.closest('a')).toHaveAttribute('href', '/configuracion');
        expect(screen.getByText('Cerrar Sesión')).toBeInTheDocument();
    });
});
