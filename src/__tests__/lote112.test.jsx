// [P1-PLAN-LOTE-112 · 2026-09-19] «Calculando tus metas…» solo la primera vez: las metas se recuerdan por usuario y
// la pantalla pinta con ellas mientras vuelve a pedirlas por detrás.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardTracking from '../components/dashboard/DashboardTracking';
import { fetchWithAuth } from '../config/api';
import { readTargetsCache, writeTargetsCache, clearTargetsCache, TARGETS_CACHE_KEY } from '../utils/targetsCache';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const perfil = vi.hoisted(() => ({ id: 'u1' }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({ userProfile: perfil.id ? { id: perfil.id } : null, formData: {}, planData: null, session: null }),
}));
vi.mock('../components/dashboard/TrackingProgress', () => ({ default: ({ planData }) => <div>metas:{planData.calories}</div> }));
vi.mock('../components/dashboard/HydrationTracker', () => ({ default: () => null }));

const METAS = { ok: true, calories: 2100, macros: { protein: '150g', carbs: '220g', fats: '70g' }, micros: null };
const responde = (cuerpo) => ({ ok: true, json: async () => cuerpo });
const pintar = () => render(<MemoryRouter><DashboardTracking /></MemoryRouter>);

beforeEach(() => {
    perfil.id = 'u1';
    clearTargetsCache();
    localStorage.clear();
    vi.mocked(fetchWithAuth).mockReset();
});

describe('las metas del contador', () => {
    it('la primera vez avisa; al volver a entrar ya no', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(responde(METAS));
        pintar();
        expect(screen.getByText('Calculando tus metas…')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('metas:2100')).toBeInTheDocument());
        cleanup();

        let soltar;
        vi.mocked(fetchWithAuth).mockReturnValue(new Promise((r) => { soltar = r; }));
        pintar();
        expect(screen.queryByText('Calculando tus metas…')).not.toBeInTheDocument();
        expect(screen.getByText('metas:2100')).toBeInTheDocument();
        // y lo que llega por detrás se aplica sin aviso
        soltar(responde({ ...METAS, calories: 2300 }));
        await waitFor(() => expect(screen.getByText('metas:2300')).toBeInTheDocument());
    });

    it('sobrevive a recargar la app (localStorage) y un fallo de red no pisa unas metas buenas', async () => {
        writeTargetsCache('u1', METAS);
        expect(JSON.parse(localStorage.getItem(TARGETS_CACHE_KEY)).userId).toBe('u1');
        vi.mocked(fetchWithAuth).mockRejectedValue(new Error('sin red'));
        pintar();
        expect(screen.getByText('metas:2100')).toBeInTheDocument();
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalled());
        expect(screen.getByText('metas:2100')).toBeInTheDocument();
        expect(screen.queryByText('Faltan datos para tus metas.')).not.toBeInTheDocument();
    });

    it('si el servidor dice que FALTAN datos, eso sí manda sobre lo recordado', async () => {
        writeTargetsCache('u1', METAS);
        vi.mocked(fetchWithAuth).mockResolvedValue(responde({ ok: false, missing_fields: ['weight'] }));
        pintar();
        await waitFor(() => expect(screen.getByText('Faltan datos para tus metas.')).toBeInTheDocument());
    });

    it('no enseña las metas de OTRO usuario, y se borran al cerrar sesión', () => {
        writeTargetsCache('u1', METAS);
        expect(readTargetsCache('u2')).toBeNull();
        writeTargetsCache('u1', { ok: false });
        expect(readTargetsCache('u1')).toEqual(METAS);
        clearTargetsCache();
        expect(readTargetsCache('u1')).toBeNull();
        expect(localStorage.getItem(TARGETS_CACHE_KEY)).toBeNull();
        const ctx = readFileSync(join(__dirname, '..', 'context', 'AssessmentContext.jsx'), 'utf8');
        const i = ctx.indexOf('const _clearUserScopedCaches = () => {');
        expect(ctx.slice(i, i + 4000)).toContain('clearTargetsCache();');
    });

    it('el perfil que llega tarde también encuentra la caché', async () => {
        writeTargetsCache('u1', METAS);
        perfil.id = null;
        vi.mocked(fetchWithAuth).mockReturnValue(new Promise(() => {}));
        const { rerender } = pintar();
        expect(screen.getByText('Calculando tus metas…')).toBeInTheDocument();
        perfil.id = 'u1';
        rerender(<MemoryRouter><DashboardTracking /></MemoryRouter>);
        expect(screen.getByText('metas:2100')).toBeInTheDocument();
    });
});
