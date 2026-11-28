import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import { fetchWithAuth } from '../config/api';
import WaterTracker from '../components/dashboard/WaterTracker';

describe('WaterTracker sin parpadeo al montar en frio', () => {
    beforeEach(() => {
        localStorage.clear();
        fetchWithAuth.mockReset();
    });

    it('con cache vacio no muestra la tarjeta antes de confirmar enabled=false', async () => {
        let resolveFetch;
        fetchWithAuth.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

        const { container } = render(<WaterTracker userId="u-cold" />);
        expect(container.firstChild).toBeNull();
        expect(screen.queryByRole('region', { name: 'Hidratación' })).toBeNull();

        resolveFetch({ ok: true, status: 200, json: async () => ({ glasses: 0, goal: 8, enabled: false }) });
        await waitFor(() => expect(localStorage.getItem('mealfit_water_tracker_enabled')).toBe('false'));
        expect(container.firstChild).toBeNull();
    });

    it('muestra la tarjeta limpiamente cuando el servidor confirma enabled=true', async () => {
        fetchWithAuth.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ glasses: 2, goal: 8, enabled: true, streak: 1 }),
        });

        const { container } = render(<WaterTracker userId="u-cold" />);
        expect(container.firstChild).toBeNull();

        expect(await screen.findByRole('region', { name: 'Hidratación' })).toBeInTheDocument();
        expect(screen.getByText('2 / 8')).toBeInTheDocument();
    });

    it('con initialEnabled=false no renderiza ni dispara GET water-intake', () => {
        const { container } = render(<WaterTracker userId="u-off" initialEnabled={false} />);
        expect(container.firstChild).toBeNull();
        expect(fetchWithAuth).not.toHaveBeenCalled();
    });
});
