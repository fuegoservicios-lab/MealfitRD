/**
 * [P1-PRIVACY-GPC + P1-PRIVACY-STOP-NOW · 2026-08-18] El control de privacidad,
 * comprobado por conducta y no por lectura.
 *
 * Los dos defectos que anclan estos tests eran invisibles leyendo el código
 * porque el código PARECÍA correcto: había una bandera, se consultaba, y el
 * aviso al usuario decía lo que se esperaba. Lo que fallaba era el alcance
 * (quién la consulta y cuándo), y eso solo se ve ejecutando.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const cargar = async () => {
    vi.resetModules();
    return await import('../utils/analytics');
};

const ponerGPC = (valor) => {
    Object.defineProperty(window.navigator, 'globalPrivacyControl', {
        value: valor, configurable: true, writable: true,
    });
};

describe('P1-PRIVACY-GPC · la señal del navegador', () => {
    beforeEach(() => {
        localStorage.clear();
        document.cookie = 'mf_analytics_opt_out=1; Max-Age=0; path=/';
        ponerGPC(undefined);
    });

    it('sin GPC y sin elección, la analítica NO está desactivada (conducta previa intacta)', async () => {
        const { isAnalyticsOptedOut } = await cargar();
        expect(isAnalyticsOptedOut()).toBe(false);
    });

    it('con GPC y sin elección en la app, cuenta como opt-out', async () => {
        ponerGPC(true);
        const { isAnalyticsOptedOut } = await cargar();
        expect(isAnalyticsOptedOut()).toBe(true);
    });

    it('un GPC falso no desactiva nada: solo el `true` es una petición', async () => {
        ponerGPC(false);
        const { isAnalyticsOptedOut } = await cargar();
        expect(isAnalyticsOptedOut()).toBe(false);
    });

    it('un SÍ explícito en la app gana sobre GPC — el interruptor no puede quedar muerto', async () => {
        ponerGPC(true);
        const { isAnalyticsOptedOut, persistAnalyticsOptOut } = await cargar();
        persistAnalyticsOptOut(false);            // el usuario lo enciende a sabiendas
        expect(isAnalyticsOptedOut()).toBe(false);
    });

    it('un NO explícito gana sobre la ausencia de GPC', async () => {
        ponerGPC(false);
        const { isAnalyticsOptedOut, persistAnalyticsOptOut } = await cargar();
        persistAnalyticsOptOut(true);
        expect(isAnalyticsOptedOut()).toBe(true);
    });

    it('`doNotTrack` NO se consulta: no distingue elección de ajuste de fábrica', async () => {
        Object.defineProperty(window.navigator, 'doNotTrack', {
            value: '1', configurable: true, writable: true,
        });
        const { isAnalyticsOptedOut } = await cargar();
        expect(isAnalyticsOptedOut()).toBe(false);
    });
});

describe('P1-PRIVACY-STOP-NOW · apagar surte efecto en la sesión en curso', () => {
    beforeEach(() => {
        localStorage.clear();
        ponerGPC(undefined);
    });
    afterEach(() => { delete window.posthog; });

    // [P1-PLAN-LOTE-794 · 2026-09-28] Estos dos tests pedían `opt_out_capturing` /
    // `opt_in_capturing`. En modo sin cookies ambos son no-op en el SDK, y la prueba
    // con el SDK REAL (lote794.test.js) enseñó además que la pareja
    // `opt_out_capturing()` + `reset(true)` nunca cortó nada: el reset reinicia el
    // consentimiento. Que PostHog deje de capturar y vuelva a hacerlo se comprueba
    // allí, contra el SDK; aquí queda el contrato con `window.posthog`.
    it('al apagar, PostHog suelta la identidad (el corte de eventos es el before_send)', async () => {
        const opt_out_capturing = vi.fn();
        const reset = vi.fn();
        window.posthog = { opt_out_capturing, reset, opt_in_capturing: vi.fn() };

        const { persistAnalyticsOptOut } = await cargar();
        persistAnalyticsOptOut(true);

        // `reset(true)` suelta el distinct_id de la cuenta, que sigue en memoria.
        expect(reset).toHaveBeenCalledWith(true);
        // No-op en modo sin cookies: llamarlo sería aparentar un corte que no ocurre.
        expect(opt_out_capturing).not.toHaveBeenCalled();
    });

    it('al volver a encender no se toca la identidad (la bandera basta para el before_send)', async () => {
        const opt_in_capturing = vi.fn();
        const reset = vi.fn();
        window.posthog = { opt_in_capturing, opt_out_capturing: vi.fn(), reset };

        const { persistAnalyticsOptOut, isAnalyticsOptedOut } = await cargar();
        persistAnalyticsOptOut(false);

        expect(isAnalyticsOptedOut()).toBe(false);
        expect(reset).not.toHaveBeenCalled();
        expect(opt_in_capturing).not.toHaveBeenCalled();
    });

    it('un PostHog sin esos métodos no rompe el interruptor', async () => {
        window.posthog = {};                       // SDK viejo o parcialmente cargado
        const { persistAnalyticsOptOut, isAnalyticsOptedOut } = await cargar();
        expect(() => persistAnalyticsOptOut(true)).not.toThrow();
        expect(isAnalyticsOptedOut()).toBe(true);  // la bandera se escribió igual
    });

    it('el replay de sesión se detiene por la FACHADA, no por `window.Sentry`', async () => {
        vi.resetModules();
        const stop = vi.fn();
        const obs = await import('../utils/observability');
        obs._reiniciarParaTests?.();
        obs.registrarSentry({ getReplay: () => ({ stop }) });

        const { persistAnalyticsOptOut } = await import('../utils/analytics');
        persistAnalyticsOptOut(true);

        expect(stop).toHaveBeenCalledTimes(1);
        // Y la prueba de que la vía vieja habría sido humo: `window.Sentry` no
        // existe, que es justo lo que denuncia P3-SENTRY-BREADCRUMB-DEAD.
        expect(window.Sentry).toBeUndefined();
    });

    it('encender NO detiene el replay', async () => {
        vi.resetModules();
        const stop = vi.fn();
        const obs = await import('../utils/observability');
        obs._reiniciarParaTests?.();
        obs.registrarSentry({ getReplay: () => ({ stop }) });

        const { persistAnalyticsOptOut } = await import('../utils/analytics');
        persistAnalyticsOptOut(false);

        expect(stop).not.toHaveBeenCalled();
    });
});
