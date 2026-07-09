/**
 * [P1-4 · scaffold MSW] Smoke del harness de mock de red MSW.
 *
 * El scaffold es OPT-IN (no se instala global en setupTests.js) para no
 * interferir con los ~1300 tests existentes que stubean `fetch` directo. Cada
 * test nuevo que quiera red mockeada llama setupMswServer() al tope del describe.
 * Este smoke prueba: (1) los handlers default responden, (2) server.use()
 * overridea por-test. Es la validacion del harness que consumiran P1-9 y P1-10.
 */
import { describe, it, expect } from 'vitest';
import { http, HttpResponse, setupMswServer, server } from './utils/msw';

describe('MSW scaffold (P1-4)', () => {
    setupMswServer();

    it('handler default responde (history-list → {plans:[]})', async () => {
        const res = await fetch('http://127.0.0.1:3001/api/plans/history-list');
        expect(res.ok).toBe(true);
        expect(await res.json()).toEqual({ plans: [] });
    });

    it('server.use() overridea el handler por-test', async () => {
        server.use(
            http.get('*/api/plans/history-list', () =>
                HttpResponse.json({ plans: [{ id: 'p1', name: 'Plan de prueba' }] })
            )
        );
        const res = await fetch('http://127.0.0.1:3001/api/plans/history-list');
        const body = await res.json();
        expect(body.plans).toHaveLength(1);
        expect(body.plans[0].id).toBe('p1');
    });
});
