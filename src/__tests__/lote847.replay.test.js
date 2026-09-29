/**
 * [P1-PLAN-LOTE-847 · 2026-09-29] El replay de Sentry, solo con el permiso de analítica; los errores, siempre.
 *
 * Antes `main.jsx` adjuntaba `replayIntegration()` en el idle a todo el que abría la app (en nativo también), sin mirar
 * el opt-out al arrancar. Y `detenerReplaySentry()` no paraba nada en producción: buscaba `getReplay` en lo que devuelve
 * `sentryBoot.arrancarSentry`, que no lo traía (el test de la fachada lo simulaba). Aquí se prueba con el `sentryBoot`
 * real y `@sentry/react` sustituido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let replay;
let integraciones;
let opciones;
const sentry = () => ({
    init: vi.fn(),
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    setTag: vi.fn(),
    addIntegration: vi.fn((i) => { integraciones.push(i); if (i.name === 'Replay') replay = i; }),
    replayIntegration: vi.fn(() => ({ name: 'Replay', stop: vi.fn(), start: vi.fn(), startBuffering: vi.fn() })),
    browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
    getReplay: () => replay,
    getClient: () => ({
        getIntegrationByName: (n) => (n === 'Replay' ? replay : undefined),
        getOptions: () => opciones,
    }),
});

let S;
async function cargar() {
    vi.resetModules();
    replay = undefined;
    integraciones = [];
    opciones = { replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1 };
    S = sentry();
    vi.doMock('@sentry/react', () => S);
    const analytics = await import('../utils/analytics');
    const obs = await import('../utils/observability');
    const { arrancarSentry } = await import('../utils/sentryBoot');
    obs.registrarSentry(await arrancarSentry({ dsn: 'x' }));
    const mod = await import('../utils/sentryIntegraciones');
    return { analytics, mod };
}

beforeEach(() => {
    localStorage.clear();
    document.cookie = 'mf_analytics_opt_out=1; Max-Age=0; path=/';
});

describe('[P1-PLAN-LOTE-847] el replay pide permiso', () => {
    it('sin permiso: el tracing se adjunta, el replay NO (y Sentry sigue arrancado para los errores)', async () => {
        const { mod } = await cargar();
        mod.adjuntarTracingSentry();
        expect(mod.encenderReplaySentry()).toBe(false);
        expect(S.init).toHaveBeenCalledTimes(1);
        expect(integraciones.map((i) => i.name)).toEqual(['BrowserTracing']);
        expect(S.replayIntegration).not.toHaveBeenCalled();
    });

    it('cuenta vieja (NULL) tampoco: solo `true` enciende el replay', async () => {
        const { analytics, mod } = await cargar();
        analytics.fijarPermisoAnalitica(null);
        expect(mod.encenderReplaySentry()).toBe(false);
        expect(S.replayIntegration).not.toHaveBeenCalled();
    });

    it('con permiso: se adjunta enmascarado', async () => {
        const { analytics, mod } = await cargar();
        analytics.fijarPermisoAnalitica(true);
        expect(mod.encenderReplaySentry()).toBe(true);
        expect(S.replayIntegration).toHaveBeenCalledWith({ maskAllText: true, blockAllMedia: true });
        expect(replay).toBeTruthy();
    });

    it('retirar el permiso PARA el replay ya (la fachada ya encuentra el replay del SDK real)', async () => {
        const { analytics, mod } = await cargar();
        analytics.fijarPermisoAnalitica(true);
        mod.encenderReplaySentry();
        analytics.fijarPermisoAnalitica(false);        // p. ej. el servidor dice analytics_consent=false
        expect(replay.stop).toHaveBeenCalledTimes(1);
    });

    it('apagar «Ayuda a mejorar» también lo para', async () => {
        const { analytics, mod } = await cargar();
        analytics.fijarPermisoAnalitica(true);
        mod.encenderReplaySentry();
        analytics.persistAnalyticsOptOut(true);
        expect(replay.stop).toHaveBeenCalled();
    });

    it('volver a darlo lo reanuda con las tasas de Sentry.init, sin un segundo replay', async () => {
        const { analytics, mod } = await cargar();
        analytics.fijarPermisoAnalitica(true);
        mod.encenderReplaySentry();
        analytics.fijarPermisoAnalitica(false);
        analytics.fijarPermisoAnalitica(true);
        mod.encenderReplaySentry();
        expect(S.replayIntegration).toHaveBeenCalledTimes(1);
        // replaysSessionSampleRate 0 → solo el búfer para errores, nunca start() (grabaría el 100 %).
        expect(replay.startBuffering).toHaveBeenCalledTimes(1);
        expect(replay.start).not.toHaveBeenCalled();
    });

    it('si el permiso se retira mientras el trozo viajaba, no se adjunta', async () => {
        const { analytics, mod } = await cargar();
        analytics.fijarPermisoAnalitica(true);
        analytics.fijarPermisoAnalitica(false);
        expect(mod.encenderReplaySentry()).toBe(false);
        expect(S.replayIntegration).not.toHaveBeenCalled();
    });
});

describe('[P1-PLAN-LOTE-847] main.jsx: el idle ya no adjunta el replay', () => {
    // Sin las líneas de comentario: la historia del replay se sigue contando en main.jsx.
    const MAIN = fs.readFileSync(path.resolve(__dirname, '../main.jsx'), 'utf8').replace(/^\s*\/\/.*$/gm, '');

    it('main.jsx no llama a replayIntegration: el replay vive en sentryIntegraciones.js, tras el permiso', () => {
        expect(MAIN).not.toMatch(/replayIntegration\(/);
        expect(MAIN).toMatch(/m\.adjuntarTracingSentry\(\)/);
    });

    it('el replay se enciende desde el aviso del permiso (sin recargar)', () => {
        expect(MAIN).toMatch(/alCambiarAnalitica\(\(si\) => \{ if \(si\) _integracionesSentry\(\)\.then\(\(m\) => m\.encenderReplaySentry\(\)\)/);
    });

    it('main.jsx no importa el módulo del permiso (fuera del arranque)', () => {
        expect(MAIN).not.toMatch(/from '\.\/consent\//);
    });
});
