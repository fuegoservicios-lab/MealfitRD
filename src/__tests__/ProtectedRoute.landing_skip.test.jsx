/* [LANDING-SKIP-NO-PLAN-FLASH · 2026-06-01] Regresión del "flash del dashboard"
 * al refrescar la landing. Una cuenta con health_profile PERO SIN plan saltaba
 * `/` → `/dashboard` (por `hasCompletedAssessment`) y el dashboard rebotaba a
 * `/assessment` por su guard `!planData` → flash visible. El fix decide el destino
 * en ProtectedRoute sin pasar por /dashboard.
 *
 * MemoryRouter en su render inicial reporta navigationType='POP' (cold load /
 * refresh / back) — justo el caso del bug. Cada test override planData/userProfile. */
import { describe, it, expect } from 'vitest';
import { render, screen } from './utils/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';

const renderLanding = (customContext) =>
    render(
        <Routes>
            <Route path="/" element={<ProtectedRoute><div>LANDING</div></ProtectedRoute>} />
            <Route path="/dashboard" element={<div>DASHBOARD</div>} />
            <Route path="/assessment" element={<div>ASSESSMENT</div>} />
        </Routes>,
        {
            customContext,
            wrapper: ({ children }) => (
                <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
            ),
        }
    );

describe('[LANDING-SKIP-NO-PLAN-FLASH] refresh (POP) de la landing no pasa por el dashboard', () => {
    const base = { session: { user: { id: 'u1' } }, loadingAuth: false, loadingData: false };

    it('con PLAN real → salta directo al dashboard', () => {
        renderLanding({ ...base, planData: { id: 'p1' }, userProfile: { health_profile: { age: 30 } } });
        expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
        expect(screen.queryByText('ASSESSMENT')).not.toBeInTheDocument();
    });

    it('con perfil completo pero SIN plan → va al formulario, NUNCA al dashboard (cierra el flash)', () => {
        renderLanding({ ...base, planData: null, userProfile: { health_profile: { age: 30 } } });
        expect(screen.getByText('ASSESSMENT')).toBeInTheDocument();
        expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
    });

    it('sin assessment ni plan → se queda en la landing', () => {
        renderLanding({ ...base, planData: null, userProfile: { health_profile: {} } });
        expect(screen.getByText('LANDING')).toBeInTheDocument();
        expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
    });
});
