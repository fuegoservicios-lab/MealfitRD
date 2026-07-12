/* [HEADER-STICKY-CTA · actualizado 2026-07-12] El Header del landing muestra un CTA
 * "Crear mi Plan Ahora" (o "Ver mi Plan" si hay plan). Contrato ACTUAL tras dos
 * rediseños commiteados:
 *   - [P3-HEADER-FLOAT-REDESIGN] El CTA es SIEMPRE visible en rutas landing-like
 *     (ya NO se gatea por scroll vía heroCtaVisible; Header dejó de consumir ese
 *     contexto — Header.jsx:10-12,72).
 *   - [P3-LANDING-NO-SESSION-CHROME] El menú de cuenta (avatar + Configuración +
 *     Cerrar Sesión) se oculta en TODAS las superficies públicas landing-like y
 *     vive SOLO en rutas de app (p.ej. /configuracion) — Header.jsx:91.
 * Consecuencia: CTA sticky y menú de cuenta son ahora MUTUAMENTE EXCLUYENTES (CTA
 * solo en landing, menú solo fuera). Este test verifica ese contrato sin depender
 * del IntersectionObserver del Hero. */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from './utils/test-utils';
import { MemoryRouter } from 'react-router-dom';
import Header from '../components/layout/Header';

describe('[HEADER-STICKY-CTA] CTA sticky del header en el landing', () => {
    it('en home (landing), el CTA sticky es SIEMPRE visible → /assessment [P3-HEADER-FLOAT-REDESIGN]', () => {
        render(<Header />, { customContext: { planData: null, session: null } });
        const cta = screen.getByText('Crear mi Plan Ahora');
        expect(cta).toBeInTheDocument();
        expect(cta.closest('a')).toHaveAttribute('href', '/assessment');
    });

    it('en home con plan activo, el CTA sticky refleja "Ver mi Plan" → /dashboard', () => {
        render(<Header />, { customContext: { planData: { id: 'plan-1' }, session: null } });
        const cta = screen.getByText('Ver mi Plan');
        expect(cta).toBeInTheDocument();
        expect(cta.closest('a')).toHaveAttribute('href', '/dashboard');
    });

    it('fuera del landing (ruta de app, p.ej. /configuracion) el CTA sticky NO aparece', () => {
        // /privacy YA es landing-like (P3-LEGAL-HEADER-PARITY) y muestra el CTA; usamos
        // una ruta de app real (no marketing/legal/novedades/supermercado).
        render(<Header />, {
            customContext: { planData: null, session: null },
            wrapper: ({ children }) => (
                <MemoryRouter initialEntries={['/configuracion']}>{children}</MemoryRouter>
            ),
        });
        expect(screen.queryByText('Crear mi Plan Ahora')).not.toBeInTheDocument();
        expect(screen.queryByText('Ver mi Plan')).not.toBeInTheDocument();
    });

    it('[P3-LANDING-NO-SESSION-CHROME] en landing con sesión, el menú de cuenta NO aparece', () => {
        // En el landing el chrome de sesión vive en el DashboardLayout, no en el Header.
        render(<Header />, {
            customContext: { planData: { id: 'plan-1' }, session: { user: { id: 'u-1', email: 'a@b.com' } } },
        });
        expect(screen.queryByLabelText('Abrir menú de cuenta')).not.toBeInTheDocument();
    });

    it('[ACCOUNT-MENU] en ruta de app con sesión, el menú agrupa "Configuración" + "Cerrar Sesión" (cerrado por defecto)', () => {
        render(<Header />, {
            customContext: { planData: { id: 'plan-1' }, session: { user: { id: 'u-1', email: 'a@b.com' } } },
            wrapper: ({ children }) => (
                <MemoryRouter initialEntries={['/configuracion']}>{children}</MemoryRouter>
            ),
        });
        // Cerrado por defecto: ninguna acción ocupa espacio en el header.
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
