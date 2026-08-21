/* [P1-ASSESSMENT-POP-DASHBOARD · 2026-08-20] El CTA "Crear mi plan" del apex
 * (bioboros.com, landing ESTÁTICA sin sesión) aterriza como carga de documento
 * nueva en app.bioboros.com/assessment. Un usuario con sesión y assessment YA
 * completado veía el FORMULARIO en vez de su dashboard: ProtectedRoute solo
 * guardaba la dirección "sin assessment → /assessment", nunca la inversa.
 *
 * El guard nuevo es POP-only (cold-start / redirect del apex / URL tecleada) y
 * exime el reload del documento, así que NO toca:
 *   - los `navigate('/assessment')` internos (renovar/regenerar desde
 *     Dashboard, History, Settings, DashboardTracking) — navegación PUSH;
 *   - el F5 a mitad de formulario — POP con performance type 'reload'.
 *
 * MemoryRouter reporta navigationType='POP' en su render inicial — justo el
 * caso del bug (mismo arnés que ProtectedRoute.landing_skip.test.jsx). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from './utils/test-utils';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';

const routes = (
    <Routes>
        <Route path="/assessment" element={<ProtectedRoute><div>ASSESSMENT</div></ProtectedRoute>} />
        <Route path="/dashboard" element={<div>DASHBOARD<Link to="/assessment">RENOVAR</Link></div>} />
    </Routes>
);

const renderAt = (initialEntries, customContext) =>
    render(routes, {
        customContext,
        wrapper: ({ children }) => (
            <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
        ),
    });

const base = {
    session: { user: { id: 'u1' } },
    loadingAuth: false,
    loadingData: false,
    loadingProfile: false,
    isGuest: false,
};

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
});

describe('[P1-ASSESSMENT-POP-DASHBOARD] llegada fría (POP) a /assessment con assessment completado', () => {
    it('con PLAN real → redirige al dashboard (el bug del CTA del apex)', () => {
        renderAt(['/assessment'], {
            ...base,
            planData: { id: 'p1' },
            userProfile: { health_profile: { age: 30 } },
        });
        expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
        expect(screen.queryByText('ASSESSMENT')).not.toBeInTheDocument();
    });

    it('en modo seguimiento (perfil completo, sin plan a propósito) → dashboard, no re-preguntar el formulario', () => {
        renderAt(['/assessment'], {
            ...base,
            planData: null,
            userProfile: { health_profile: { age: 30 }, plan_mode: 'tracking' },
        });
        expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
        expect(screen.queryByText('ASSESSMENT')).not.toBeInTheDocument();
    });

    it('con perfil completo pero SIN plan (modo plan) → el formulario ES su destino, se queda', () => {
        renderAt(['/assessment'], {
            ...base,
            planData: null,
            userProfile: { health_profile: { age: 30 } },
        });
        expect(screen.getByText('ASSESSMENT')).toBeInTheDocument();
        expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
    });

    it('cuenta nueva (sin perfil ni plan) → se queda en el formulario (onboarding)', () => {
        renderAt(['/assessment'], {
            ...base,
            planData: null,
            userProfile: { health_profile: {} },
        });
        expect(screen.getByText('ASSESSMENT')).toBeInTheDocument();
        expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
    });

    it('navegación PUSH interna (renovar plan desde el dashboard) → NO redirige aunque haya plan', () => {
        renderAt(['/dashboard'], {
            ...base,
            planData: { id: 'p1' },
            userProfile: { health_profile: { age: 30 } },
        });
        fireEvent.click(screen.getByText('RENOVAR'));
        expect(screen.getByText('ASSESSMENT')).toBeInTheDocument();
        expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
    });

    it('F5 sobre /assessment (POP con performance type reload) → se queda en el formulario', () => {
        vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' }]);
        renderAt(['/assessment'], {
            ...base,
            planData: { id: 'p1' },
            userProfile: { health_profile: { age: 30 } },
        });
        expect(screen.getByText('ASSESSMENT')).toBeInTheDocument();
        expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
    });
});
