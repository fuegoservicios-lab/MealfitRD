/**
 * [P1-PLAN-LOTE-794 · 2026-09-28] (G28) PostHog sin cookies y sin banner — comprobado con el SDK REAL.
 *
 * La decisión del dueño: en España la analítica con cookie exige consentimiento previo (banner); la
 * alternativa elegida es que PostHog no deje NADA en el dispositivo (`cookieless_mode: 'always'`,
 * posthog-js ≥ 1.2xx): ni cookie, ni `localStorage`, ni `sessionStorage`. La identidad del visitante
 * la calcula PostHog en su servidor.
 *
 * Por qué con el SDK real y no con un mock de `posthog.init`: un mock sólo prueba que pasamos una
 * opción, no que la opción haga lo que creemos. Leyendo posthog-js 1.399.2 salieron tres cosas que
 * un mock no habría visto nunca:
 *   1. `opt_out_capturing()` y `opt_in_capturing()` son NO-OP en modo `always` (avisan y salen). El
 *      interruptor de Configuración quedaba muerto: por eso el corte vive ahora en `before_send`.
 *   2. Sin persistencia, la identidad no sobrevive a la recarga: `identify()` hay que repetirlo en
 *      CADA carga, y a menudo llega ANTES de que el SDK (import diferido en idle) exista.
 *   3. La persistencia deshabilitada BORRA la entrada de su propio almacén al arrancar: con
 *      `persistence: 'localStorage+cookie'` se limpian la cookie y el `localStorage` que los
 *      visitantes arrastran de antes de este cambio.
 *
 * La red está cortada (fetch y XHR sustituidos): el SDK no sale de este proceso.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = 'phc_test_lote794';
const NOMBRE_PERSISTENCIA = `ph_${TOKEN}_posthog`;

const rastrosDePostHog = () => {
    const esDePostHog = (k) => /(^|_)ph_|posthog/i.test(k);
    const cookies = document.cookie
        .split(';')
        .map((c) => c.trim().split('=')[0])
        .filter(Boolean)
        .filter(esDePostHog);
    const local = Object.keys(localStorage).filter(esDePostHog);
    const sesion = Object.keys(sessionStorage).filter(esDePostHog);
    return [...cookies, ...local, ...sesion];
};

describe('P1-PLAN-LOTE-794 · PostHog sin cookies ni almacenamiento (SDK real)', () => {
    let cliente;
    let analytics;
    let capturados;

    beforeAll(async () => {
        localStorage.clear();
        sessionStorage.clear();
        // Red cortada: nada sale del proceso de test.
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, headers: new Map(),
            json: async () => ({}), text: async () => '{}',
        })));
        vi.stubGlobal('XMLHttpRequest', class {
            open() {} send() {} setRequestHeader() {} abort() {}
        });
        vi.stubEnv('VITE_POSTHOG_KEY', TOKEN);

        // Un visitante que ya traía el identificador de la configuración vieja.
        document.cookie = `${NOMBRE_PERSISTENCIA}=%7B%22distinct_id%22%3A%22viejo%22%7D; path=/`;
        localStorage.setItem(NOMBRE_PERSISTENCIA, '{"distinct_id":"viejo"}');

        vi.resetModules();
        analytics = await import('../utils/analytics');
        cliente = await import('../utils/posthogClient');

        // La sesión se conoce ANTES de que el SDK exista (import diferido en idle).
        expect(window.posthog).toBeUndefined();
        cliente.identifyPostHog('usuario-794');

        await cliente.initPostHog();
        capturados = [];
        window.posthog.on('eventCaptured', (ev) => capturados.push(ev.event));
    });

    afterAll(() => {
        document.cookie = 'mf_analytics_opt_out=1; Max-Age=0; path=/';
        localStorage.clear();
        sessionStorage.clear();
        delete window.posthog;
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('arranca en modo sin cookies, sin persistencia', () => {
        expect(window.posthog.config.cookieless_mode).toBe('always');
        expect(window.posthog.config.disable_persistence).toBe(true);
        expect(window.posthog.persistence.isDisabled()).toBe(true);
    });

    it('borra la cookie y el localStorage que el visitante traía de antes', () => {
        expect(document.cookie).not.toContain(NOMBRE_PERSISTENCIA);
        expect(localStorage.getItem(NOMBRE_PERSISTENCIA)).toBeNull();
    });

    it('la identidad pedida ANTES de cargar el SDK se aplica al cargarlo', () => {
        expect(window.posthog.get_distinct_id()).toBe('usuario-794');
    });

    it('capturar, identificar y resetear no deja cookie, localStorage ni sessionStorage de PostHog', () => {
        window.posthog.capture('$pageview');
        window.posthog.capture('evento_de_prueba', { a: 1 });
        analytics.trackEvent('evento_por_la_fachada', { b: 2 });
        cliente.identifyPostHog('usuario-794');
        cliente.resetPostHog();
        cliente.identifyPostHog('otro-usuario');
        expect(rastrosDePostHog()).toEqual([]);
        expect(capturados).toContain('evento_de_prueba');
        expect(capturados).toContain('evento_por_la_fachada');
    });

    it('logout: la identidad vuelve al centinela anónimo del modo sin cookies', () => {
        cliente.identifyPostHog('usuario-794');
        cliente.resetPostHog();
        expect(window.posthog.get_distinct_id()).toBe('$posthog_cookieless');
    });

    it('apagar la analítica en Configuración corta los eventos YA (opt_out_capturing es no-op aquí)', () => {
        capturados.length = 0;
        analytics.persistAnalyticsOptOut(true);
        window.posthog.capture('tras_apagar');       // p. ej. un $pageleave interno del SDK
        expect(capturados).not.toContain('tras_apagar');

        analytics.persistAnalyticsOptOut(false);
        window.posthog.capture('tras_encender');
        expect(capturados).toContain('tras_encender');
        expect(rastrosDePostHog()).toEqual([]);
    });
});

describe('P1-PLAN-LOTE-794 · la identidad se declara en CADA carga con sesión', () => {
    // Sin persistencia, la identidad de ayer no llega a hoy. Antes sólo identificaba el callback de
    // `onAuthStateChange` («identify persiste», decía su comentario); la sesión inicial y la
    // reconstruida por cookie first-party entraban por `handleAuthChange` sin identificar.
    const SRC = fs.readFileSync(path.resolve(__dirname, '../context/AssessmentContext.jsx'), 'utf8');
    const ini = SRC.indexOf('const handleAuthChange = async (currentSession) => {');
    const cuerpo = SRC.slice(ini, SRC.indexOf('const _resolveViaFirstParty', ini));

    it('handleAuthChange —por donde pasan las tres entradas de sesión— identifica y resetea', () => {
        expect(ini).toBeGreaterThan(-1);
        expect(cuerpo).toMatch(/identifyPostHog\(currentSession\.user\.id\)/);
        expect(cuerpo).toMatch(/resetPostHog\(\)/);
    });

    it('un solo sitio: el callback de onAuthStateChange ya no lo duplica', () => {
        expect(SRC.match(/identifyPostHog\(/g)).toHaveLength(1);
    });
});

describe('P1-PLAN-LOTE-794 · la Política de Privacidad dice lo que hace el código', () => {
    const LEGAL = fs.readFileSync(path.resolve(__dirname, '../pages/legal/LegalPages.jsx'), 'utf8');
    const inicio = LEGAL.indexOf('title="Política de Privacidad"');
    const privacidad = LEGAL.slice(inicio, LEGAL.indexOf('title="Términos de Servicio"', inicio));

    it('ya no afirma que PostHog guarda una cookie o una entrada de localStorage', () => {
        expect(privacidad).not.toMatch(/Sí utilizamos una cookie de <strong>analítica/);
        expect(privacidad).not.toMatch(/PostHog \(analítica de producto\):<\/strong> guarda una cookie/);
    });

    it('dice que PostHog no guarda nada en el dispositivo', () => {
        const linea = privacidad.slice(privacidad.indexOf('<strong>PostHog (analítica de producto):</strong>'));
        expect(linea.slice(0, 600)).toMatch(/sin cookies/);
    });

    it('la fecha de la política se movió con el cambio', () => {
        expect(privacidad).toContain('lastUpdated="28 de Septiembre, 2026"');
    });
});
