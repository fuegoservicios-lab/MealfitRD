/**
 * [P1-7 · error boundaries por ruta] El unico boundary era el root global, que
 * ante cualquier crash de render colapsa el shell entero (tab bar + estado
 * keep-alive del chat) a un reload. RouteErrorBoundary CONTIENE el crash a la
 * seccion: fallback compacto con "Reintentar" (key-bump, sin recargar), y tag de
 * ruta a Sentry. Los chunk-load errors siguen delegando al reload global.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
import { captureException } from '@sentry/react';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';

let errSpy;
beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); vi.clearAllMocks(); });
afterEach(() => { errSpy.mockRestore(); });

function Boom({ explode }) {
    if (explode) throw new Error('boom en la seccion');
    return <div>contenido recuperado</div>;
}

describe('RouteErrorBoundary (P1-7)', () => {
    it('renderiza children cuando no hay error', () => {
        render(<RouteErrorBoundary routeName="dashboard"><div>hola</div></RouteErrorBoundary>);
        expect(screen.getByText('hola')).toBeInTheDocument();
    });

    it('ante crash muestra fallback scoped (role=alert + boton Reintentar)', () => {
        render(<RouteErrorBoundary routeName="dashboard"><Boom explode /></RouteErrorBoundary>);
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });

    it('reporta a Sentry con tag de ruta', () => {
        render(<RouteErrorBoundary routeName="recetas"><Boom explode /></RouteErrorBoundary>);
        expect(captureException).toHaveBeenCalledTimes(1);
        const [, opts] = captureException.mock.calls[0];
        expect(opts.tags).toMatchObject({ error_boundary: 'route', route: 'recetas' });
    });

    it('Reintentar remonta la seccion (si el hijo deja de fallar, se recupera SIN recargar)', async () => {
        const user = userEvent.setup();
        function Flaky() {
            return <Boom explode={Flaky.explode} />;
        }
        Flaky.explode = true;
        render(<RouteErrorBoundary routeName="x"><Flaky /></RouteErrorBoundary>);
        expect(screen.getByRole('alert')).toBeInTheDocument();
        Flaky.explode = false;
        await user.click(screen.getByRole('button', { name: /reintentar/i }));
        expect(screen.getByText('contenido recuperado')).toBeInTheDocument();
    });
});
