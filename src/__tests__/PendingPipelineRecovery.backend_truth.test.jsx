import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// [P1-RECOVERY-BACKEND-TRUTH · 2026-06-26] El recovery del pipeline de generación dependía
// SOLO del flag local `mealfit_plan_in_progress`. Si el user volvía SIN flag (otro dispositivo,
// móvil, storage limpiado), no recuperaba nada aunque el backend siguiera generando. Este test
// verifica el check INCONDICIONAL al backend (la fuente de verdad es el KV `pending_pipeline`):
//   - 'generating' (fresco) sin flag → sintetiza flag + navega a /plan (pantalla de carga).
//   - 'complete' sin ver         → ackea + navega a /dashboard.
//   - 'none'                     → NO navega (sin redirect espurio).
//   - 'generating' STALE (>6h)   → NO navega (evita pantalla de carga infinita de un pipeline muerto).

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: () => navigateSpy,
    useLocation: () => ({ pathname: '/dashboard' }),
}));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { fetchWithAuth } from '../config/api';
import PendingPipelineRecovery from '../components/PendingPipelineRecovery';

const jsonRes = (obj) => ({ ok: true, json: async () => obj });
const LS_KEY = 'mealfit_plan_in_progress';

describe('P1-RECOVERY-BACKEND-TRUTH — recovery sin flag local (cross-device/móvil)', () => {
    beforeEach(() => {
        vi.mocked(fetchWithAuth).mockReset();
        navigateSpy.mockReset();
        try { localStorage.clear(); } catch { /* noop */ }
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it("sin flag local + backend 'generating' → escribe flag + navega a /plan", async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(
            jsonRes({ status: 'generating', started_at: new Date().toISOString() })
        );
        render(<PendingPipelineRecovery />);
        await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/plan', { replace: true }));
        expect(localStorage.getItem(LS_KEY)).toBeTruthy();
    });

    it("sin flag local + backend 'complete' → ackea + navega a /dashboard", async () => {
        const urls = [];
        vi.mocked(fetchWithAuth).mockImplementation((url) => {
            urls.push(String(url));
            return Promise.resolve(jsonRes({ status: 'complete', plan_id_final: 'plan-xyz' }));
        });
        render(<PendingPipelineRecovery />);
        await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/dashboard', { replace: true }));
        expect(urls.some((u) => u.includes('/pending-status/ack'))).toBe(true);
    });

    it("sin flag local + backend 'none' → NO navega (sin redirect espurio)", async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(jsonRes({ status: 'none' }));
        render(<PendingPipelineRecovery />);
        await new Promise((r) => setTimeout(r, 60));
        expect(navigateSpy).not.toHaveBeenCalled();
    });

    it("sin flag local + 'generating' STALE (>6h) → NO navega a /plan (sin carga infinita)", async () => {
        const old = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
        vi.mocked(fetchWithAuth).mockResolvedValue(jsonRes({ status: 'generating', started_at: old }));
        render(<PendingPipelineRecovery />);
        await new Promise((r) => setTimeout(r, 60));
        expect(navigateSpy).not.toHaveBeenCalledWith('/plan', { replace: true });
    });

    it('el check incondicional consulta /pending-status exactamente una vez por sesión', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(jsonRes({ status: 'none' }));
        render(<PendingPipelineRecovery />);
        await new Promise((r) => setTimeout(r, 60));
        const statusCalls = vi.mocked(fetchWithAuth).mock.calls.filter(
            (c) => String(c[0]).includes('/pending-status') && !String(c[0]).includes('/ack')
        );
        expect(statusCalls.length).toBe(1);
    });
});
