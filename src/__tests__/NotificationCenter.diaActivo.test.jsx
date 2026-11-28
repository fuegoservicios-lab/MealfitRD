import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({
        isGuest: false,
        userProfile: { id: 'u1', plan_mode: 'tracking' },
        session: { user: { id: 'u1' } },
        formData: {},
        planData: null,
        updateData: vi.fn(),
    }),
}));
vi.mock('../components/dashboard/MicronutrientPanel', () => ({ classify: () => ({}), restoreMicrosPanel: () => {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../utils/planModeResume', () => ({ reanudarPlanes: vi.fn() }));

import { fetchWithAuth } from '../config/api';
import { fijarDiaActivo } from '../utils/diaBiologico';
import NotificationCenter from '../components/dashboard/NotificationCenter';

const CORTE = new Date(2026, 10, 21, 4, 0, 0);
const EXTENDIDO = {
    extendido: true,
    dia: '2026-11-20',
    dia_natural: '2026-11-21',
    anterior: '2026-11-20',
    motivo: 'despierto',
    fin: CORTE.toISOString(),
    hasta: new Date(2026, 10, 21, 9, 0, 0).toISOString(),
    puede_seguir: true,
};

describe('NotificationCenter + aviso de día biológico', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* noop */ }
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ visible: false, dismissed: true }) });
    });

    afterEach(() => {
        fijarDiaActivo(null);
        cleanup();
        vi.clearAllMocks();
    });

    it('TrackingProgress no renderiza AvisoDiaActivo en la pantalla principal de Progreso', () => {
        const tp = readFileSync(resolve(process.cwd(), 'src/components/dashboard/TrackingProgress.jsx'), 'utf8');
        expect(tp).not.toContain('AvisoDiaActivo');
    });

    it('muestra badge de novedad en la campana al extender el día y lo limpia al abrir notificaciones', async () => {
        fijarDiaActivo(EXTENDIDO);
        render(
            <MemoryRouter>
                <NotificationCenter />
            </MemoryRouter>,
        );

        const bellSinLeer = screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' });
        expect(bellSinLeer).toBeInTheDocument();
        expect(bellSinLeer.textContent).toContain('1');

        await act(async () => {
            fireEvent.click(bellSinLeer);
        });

        // Al abrir el centro se muestra la tarjeta y la novedad se marca vista
        expect(screen.getByText(/Sigues en tu viernes/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Empezar mi sábado/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Notificaciones$/ })).toBeInTheDocument();

        // Al cerrar, no vuelve a encender el badge mientras siga el mismo estado
        await act(async () => {
            fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar notificaciones' })[0]);
        });
        expect(screen.getByRole('button', { name: /^Notificaciones$/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /sin leer/i })).not.toBeInTheDocument();
    });

    it('al pulsar Empezar mi sábado actualiza el día, cierra el cajón y quita el aviso', async () => {
        fijarDiaActivo(EXTENDIDO);
        render(
            <MemoryRouter>
                <NotificationCenter />
            </MemoryRouter>,
        );

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' }));
        });

        fetchWithAuth.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ ...EXTENDIDO, extendido: false, dia: '2026-11-21', puede_seguir: false }),
        });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Empezar mi sábado/i }));
        });

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
});
