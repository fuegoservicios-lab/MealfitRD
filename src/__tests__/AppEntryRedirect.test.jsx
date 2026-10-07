import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { render, screen, fireEvent } from './utils/test-utils';
import AppEntryRedirect from '../components/layout/AppEntryRedirect';
import ProtectedRoute from '../components/layout/ProtectedRoute';

const base = {
    session: { user: { id: 'u1' } }, isGuest: false,
    loadingAuth: false, loadingData: false, loadingProfile: false,
    userProfile: { plan_mode: 'tracking', health_profile: { age: 30 } },
    planData: null,
};

function mount(context = {}, entry = '/') {
    return render(<Routes>
        <Route path="/" element={<AppEntryRedirect />} />
        <Route path="/dashboard" element={<ProtectedRoute><div>PROGRESO<Link to="/dashboard/agent">Abrir chat</Link></div></ProtectedRoute>} />
        <Route path="/dashboard/agent" element={<ProtectedRoute><div>AGENTE<Link to="/dashboard">Ver progreso</Link></div></ProtectedRoute>} />
        <Route path="/dashboard/pantry" element={<ProtectedRoute><div>NEVERA</div></ProtectedRoute>} />
        <Route path="/assessment" element={<div>FORMULARIO</div>} />
        <Route path="/plan" element={<div>GENERANDO</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
    </Routes>, {
        customContext: { ...base, ...context },
        wrapper: ({ children }) => <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>,
    });
}

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe('app entrance follows the generator setting', () => {
    it('opens Agent with the generator disabled, even with a saved plan', () => {
        mount({ planData: { id: 'paused-plan' } });
        expect(screen.getByText('AGENTE')).toBeInTheDocument();
    });
    it('keeps the plan dashboard with the generator enabled', () => {
        mount({ userProfile: { plan_mode: 'plan', health_profile: { age: 30 } }, planData: { id: 'plan' } });
        expect(screen.getByText('PROGRESO')).toBeInTheDocument();
    });
    it.each(['loadingAuth', 'loadingData', 'loadingProfile'])('waits for %s before deciding the entrance', (flag) => {
        const view = mount({ [flag]: true });
        expect(view.container.querySelector('.page-loader')).toBeInTheDocument();
        expect(screen.queryByText('AGENTE')).not.toBeInTheDocument();
        expect(screen.queryByText('PROGRESO')).not.toBeInTheDocument();
    });
    it('uses the existing tracking mirror when the profile could not load', () => {
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        mount({ userProfile: null });
        expect(screen.getByText('AGENTE')).toBeInTheDocument();
    });
    it('does not send a new account into chat before completing onboarding', () => {
        mount({ userProfile: { plan_mode: 'tracking', health_profile: {} } });
        expect(screen.getByText('FORMULARIO')).toBeInTheDocument();
    });
    it('does not use another account’s cached tracking choice to bypass onboarding', () => {
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        mount({ userProfile: { health_profile: {} } });
        expect(screen.getByText('FORMULARIO')).toBeInTheDocument();
    });
    it('keeps a guest on the allowed dashboard instead of opening account-only chat', () => {
        mount({ session: null, isGuest: true, planData: { id: 'guest-plan' } });
        expect(screen.getByText('PROGRESO')).toBeInTheDocument();
    });
    it('requires login for an anonymous visitor', () => {
        mount({ session: null, userProfile: null });
        expect(screen.getByText('LOGIN')).toBeInTheDocument();
    });
    it('lets pending generation recovery take priority', () => {
        window.localStorage.setItem('mealfit_plan_in_progress', JSON.stringify({ user_id: 'u1' }));
        mount();
        expect(screen.getByText('GENERANDO')).toBeInTheDocument();
    });
    it('allows Progress after entering Agent and preserves it on resume', () => {
        mount();
        fireEvent.click(screen.getByText('Ver progreso'));
        fireEvent(window, new Event('focus'));
        fireEvent(document, new Event('visibilitychange'));
        expect(screen.getByText('PROGRESO')).toBeInTheDocument();
        expect(screen.queryByText('AGENTE')).not.toBeInTheDocument();
    });
    it('preserves an explicit Progress URL on cold start', () => {
        mount({}, '/dashboard');
        expect(screen.getByText('PROGRESO')).toBeInTheDocument();
    });
    it('preserves an explicit pantry deep link', () => {
        mount({}, '/dashboard/pantry');
        expect(screen.getByText('NEVERA')).toBeInTheDocument();
    });
});
