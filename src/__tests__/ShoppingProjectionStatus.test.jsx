// [P1-ARQ25-F5-UI-STATES · 2026-09-05] La proyección de compras (Fase 5) tiene estado en el servidor
// (`GET /api/plans/{plan_id}/projections`: none/pending/ready/failed/stale); el Dashboard lo pinta en
// UNA línea discreta y sondea solo mientras está `pending`.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fetchWithAuth = vi.fn();
vi.mock('../config/api', () => ({ fetchWithAuth: (...a) => fetchWithAuth(...a), API_BASE: '' }));

import ShoppingProjectionStatus from '../components/dashboard/ShoppingProjectionStatus';
import { projectionLine } from '../utils/projectionLine';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const ready = { status: 'ready', revision: 90, projection: { windows: [{ kind: 'main', days: 30, item_count: 54, cost_rd: 14563.64 }] } };

describe('projectionLine (puro)', () => {
    it('ready → ciclo, artículos y costo; sin costo → sin «≈»', () => {
        const l = projectionLine(ready);
        expect(l.tone).toBe('ok');
        expect(l.text).toContain('30 días');
        expect(l.text).toContain('54 artículos');
        expect(l.text).toContain('RD$');
        const sinCosto = projectionLine({ ...ready, projection: { windows: [{ kind: 'main', days: 30, item_count: 54, cost_rd: null }] } });
        expect(sinCosto.text).not.toContain('≈');
    });
    it('pending / failed(retrying) / failed(dead) / stale / none', () => {
        expect(projectionLine({ status: 'pending' }).tone).toBe('muted');
        expect(projectionLine({ status: 'failed', retrying: true }).text).toContain('se reintentará');
        expect(projectionLine({ status: 'failed', retrying: false }).tone).toBe('warn');
        expect(projectionLine({ ...ready, status: 'stale' }).text).toContain('desactualizada');
        expect(projectionLine({ status: 'none' })).toBeNull();
        expect(projectionLine(null)).toBeNull();
    });
});

describe('<ShoppingProjectionStatus />', () => {
    beforeEach(() => { fetchWithAuth.mockReset(); });
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it('lee el endpoint del plan y pinta la línea con el estado', async () => {
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ready });
        render(<ShoppingProjectionStatus planId="e45e649c-231d-493a-adbf-af8aa8b73ce8" refreshKey={1} />);
        await waitFor(() => expect(screen.getByText(/54 artículos/)).toBeTruthy());
        expect(fetchWithAuth).toHaveBeenCalledWith('/api/plans/e45e649c-231d-493a-adbf-af8aa8b73ce8/projections');
        expect(document.querySelector('[data-projection-status="ready"]')).toBeTruthy();
    });

    it('con `none` no pinta nada y sin plan no llama', async () => {
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ status: 'none', revision: 1 }) });
        const { container, rerender } = render(<ShoppingProjectionStatus planId="p1" />);
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        expect(container.querySelector('p')).toBeNull();
        rerender(<ShoppingProjectionStatus planId={null} />);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });

    it('con `pending` vuelve a sondear a los 30 s', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ status: 'pending', revision: 2 }) });
        render(<ShoppingProjectionStatus planId="p2" />);
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        await vi.advanceTimersByTimeAsync(30_000 + 50);
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(2));
    });
});

describe('cableado en el Dashboard', () => {
    it('importa y monta el estado bajo las acciones de la lista, solo con plan sano y usuario con cuenta', () => {
        const src = read('src/pages/Dashboard.jsx');
        expect(src).toContain("import ShoppingProjectionStatus from '../components/dashboard/ShoppingProjectionStatus';");
        expect(src).toContain('<ShoppingProjectionStatus');
        const i = src.indexOf('<ShoppingProjectionStatus');
        const block = src.slice(i, i + 400);
        expect(block).toContain('planId={planData?.id}');
        expect(block).toContain('enabled={!isGuest && !isPlanCorrupted && !isPlanExpired && !planFinished}');
    });
});
