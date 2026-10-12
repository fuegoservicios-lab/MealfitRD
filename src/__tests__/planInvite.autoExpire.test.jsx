import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => ({
    session: { user: { id: 'u1' } }, userProfile: { id: 'u1' }, updateData: vi.fn(),
}) }));
vi.mock('../i18n', () => ({ useT: () => (text) => text, useTn: () => (_n, _one, many) => many }));
vi.mock('../config/formValidation', () => ({ missingPlanQuestionsCount: () => 0 }));
vi.mock('../components/dashboard/TrackingProgress', () => ({ default: () => null }));
vi.mock('../components/dashboard/WaterTracker', () => ({ default: () => null }));
vi.mock('../utils/planModeResume', () => ({ reanudarPlanes: vi.fn() }));

import { fetchWithAuth } from '../config/api';
import { TurnOnPlanCard } from '../components/dashboard/DashboardTracking';
import { SEMANA_MS, A_LA_VISTA_MS, estadoLocal } from '../utils/planInvite';

const KEY = 'mealfit_turnon_card_dismissed';
const T0 = Date.parse('2026-10-12T12:00:00Z');
const response = (body) => ({ ok: true, json: async () => body });
const patchActions = () => fetchWithAuth.mock.calls
    .filter(([, options]) => options?.method === 'PATCH').map(([, options]) => JSON.parse(options.body).action);
const mount = async (props = {}) => {
    let view;
    await act(async () => { view = render(<TurnOnPlanCard formData={{}} {...props} />); });
    return view;
};
const advance = async (ms) => act(async () => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(T0); localStorage.clear();
    fetchWithAuth.mockReset();
    fetchWithAuth.mockResolvedValue(response({ visible: true, next_at: null, visible_until: null }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('weekly plan invitation closes automatically', () => {
    it.each([false, true])('closes after one minute without recording «Ahora no» (paused=%s)', async (paused) => {
        await mount({ hayPlanPausado: paused });
        const button = paused ? 'Reanudar el plan' : 'Encender el plan';
        expect(screen.getByRole('button', { name: button })).toBeVisible();
        await advance(59_999);
        expect(screen.getByRole('button', { name: button })).toBeVisible();
        await advance(1);
        expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument();
        expect(estadoLocal(KEY, 'u1')).toBe('escondida');
        expect(patchActions()).toEqual(['seen']);
    });

    it('returning to the panel uses the remaining time rather than restarting the minute', async () => {
        const view = await mount();
        await advance(40_000); view.unmount();
        await mount();
        await advance(19_999);
        expect(screen.getByRole('button', { name: 'Encender el plan' })).toBeVisible();
        await advance(1);
        expect(screen.queryByRole('button', { name: 'Encender el plan' })).not.toBeInTheDocument();
        cleanup(); await mount();
        expect(screen.queryByRole('button', { name: 'Encender el plan' })).not.toBeInTheDocument();
    });

    it('uses the server deadline if the invitation was already seen on another device', async () => {
        vi.setSystemTime(T0 + 30_000);
        fetchWithAuth.mockResolvedValue(response({ visible: true,
            next_at: new Date(T0 + SEMANA_MS).toISOString(),
            visible_until: new Date(T0 + A_LA_VISTA_MS).toISOString() }));
        await mount();
        await advance(30_000);
        expect(screen.queryByRole('button', { name: 'Encender el plan' })).not.toBeInTheDocument();
        expect(patchActions()).toEqual([]);
    });

    it('an old 24-hour cache keeps its original start and expires after the new minute', async () => {
        localStorage.setItem(KEY, JSON.stringify({ u: 'u1', visibleUntil: T0 + 86_400_000, until: T0 + SEMANA_MS }));
        vi.setSystemTime(T0 + 59_000);
        await mount(); await advance(1_000);
        expect(screen.queryByRole('button', { name: 'Encender el plan' })).not.toBeInTheDocument();
    });

    it('a shorter server deadline also updates an already visible cached card', async () => {
        localStorage.setItem(KEY, JSON.stringify({ v: 2, u: 'u1', visibleUntil: T0 + A_LA_VISTA_MS, until: T0 + SEMANA_MS }));
        fetchWithAuth.mockResolvedValue(response({ visible: true,
            next_at: new Date(T0 + SEMANA_MS).toISOString(),
            visible_until: new Date(T0 + 30_000).toISOString() }));
        await mount(); await advance(30_000);
        expect(screen.queryByRole('button', { name: 'Encender el plan' })).not.toBeInTheDocument();
    });

    it('a delayed visibility check cannot reopen the expired card', async () => {
        localStorage.setItem(KEY, JSON.stringify({ v: 2, u: 'u1', visibleUntil: T0 + A_LA_VISTA_MS, until: T0 + SEMANA_MS }));
        let resolve;
        fetchWithAuth.mockImplementation(() => new Promise((done) => { resolve = done; }));
        await mount(); await advance(60_000);
        await act(async () => { resolve(response({ visible: true, next_at: null })); });
        expect(screen.queryByRole('button', { name: 'Encender el plan' })).not.toBeInTheDocument();
    });

    it('«Ahora no» still closes immediately and suppresses the invitation for a week', async () => {
        await mount();
        fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
        expect(screen.queryByRole('button', { name: 'Encender el plan' })).not.toBeInTheDocument();
        expect(estadoLocal(KEY, 'u1', T0 + SEMANA_MS - 1)).toBe('escondida');
        await advance(60_000);
        expect(patchActions()).toEqual(['seen', 'dismiss']);
    });
});
