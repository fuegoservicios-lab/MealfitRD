/**
 * [P1-4 · MSW harness] Punto de entrada del scaffold MSW. Re-exporta `server`,
 * los helpers de `msw` (http/HttpResponse) y `setupMswServer()` — un helper
 * opt-in que cablea el ciclo de vida del server en el archivo de test actual.
 *
 * DISENO: NO se instala global en setupTests.js a proposito. Los ~1300 tests
 * existentes stubean `fetch` directo con vi.stubGlobal; un server MSW global
 * interceptaria/competiria con esos stubs. Cada test NUEVO que quiera red
 * mockeada llama setupMswServer() al tope de su describe.
 *
 * Ejemplo:
 *   import { setupMswServer, server, http, HttpResponse } from './utils/msw';
 *   describe('mi feature', () => {
 *     setupMswServer();                       // beforeAll/afterEach/afterAll
 *     it('...', async () => {
 *       server.use(http.get('*\/api/x', () => HttpResponse.json({...})));
 *       // ...render/hook que hace fetch a /api/x
 *     });
 *   });
 */
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

export { server };
export * from './handlers';
export { http, HttpResponse } from 'msw';

/**
 * Cablea el ciclo de vida del MSW server en el describe/archivo actual.
 * @param {{ onUnhandledRequest?: 'bypass'|'warn'|'error' }} [options]
 *   default 'bypass' (no falla en requests no-mockeados). Los tests de
 *   characterization estrictos pueden pasar 'error' para cazar llamadas no
 *   mockeadas.
 * @returns el `server` para conveniencia.
 */
export function setupMswServer(options = {}) {
    beforeAll(() => server.listen({ onUnhandledRequest: 'bypass', ...options }));
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());
    return server;
}
