/**
 * [P1-PLAN-LOTE-840 · 842 · 2026-09-29] La app no manda a PostHog lo que se pulsa (SDK real, no un mock de `init`).
 *
 * Historia:
 * - 716 enmascaró el texto y los atributos del autocapture.
 * - 840 probó que el texto de un chip no viajaba.
 * - El revisor de la sesión 6d vio que la POSICIÓN del chip (`nth_child`) sí viajaba.
 * - 842 marcó pantallas con `ph-no-capture` y cada ronda encontraba otra.
 * - La solución de raíz (842, ronda 3) es apagar el autocapture en la app: PostHog recibe las pantallas y los
 *   eventos propios de `trackEvent`, cuya lista cerrada fija `lote842.eventos.test.js`.
 *
 * El control crea una SEGUNDA instancia con el autocapture encendido y comprueba que el mismo clic sí la alcanza.
 * Sin él, la prueba podría pasar porque el arnés no viera ningún clic.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const TOKEN = 'phc_test_lote840';
const SENSIBLE = 'Diabetes tipo 2';

const eventosApp = [];
const eventosControl = [];

const pulsarChip = () => {
    const chip = document.createElement('div');
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', SENSIBLE);
    chip.style.cursor = 'pointer';
    chip.textContent = SENSIBLE;
    document.body.appendChild(chip);
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    chip.remove();
};

describe('P1-PLAN-LOTE-840/842 · PostHog no registra lo que se pulsa en la app (SDK real)', () => {
    let control;

    beforeAll(async () => {
        localStorage.clear();
        sessionStorage.clear();
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, headers: new Map(), json: async () => ({}), text: async () => '{}',
        })));
        vi.stubGlobal('XMLHttpRequest', class {
            open() {} send() {} setRequestHeader() {} abort() {}
        });
        vi.stubEnv('VITE_POSTHOG_KEY', TOKEN);
        vi.resetModules();
        // [P1-PLAN-LOTE-847] Desde 847 PostHog solo arranca con el permiso de analítica ANOTADO (opt-in): antes arrancaba
        // para todo el que no lo hubiera apagado. Esta prueba mira el SDK arrancado, así que concede el permiso primero.
        (await import('../utils/analytics')).fijarPermisoAnalitica(true);
        const cliente = await import('../utils/posthogClient');
        await cliente.initPostHog();
        window.posthog.on('eventCaptured', (ev) => eventosApp.push(ev));

        // Control: la misma configuración, pero con el autocapture encendido, en una instancia aparte.
        const { posthogCaptureOptions } = await import('../utils/observabilityScope');
        control = window.posthog.init(TOKEN, {
            ...posthogCaptureOptions(),
            autocapture: true,
            cookieless_mode: 'always',
            disable_persistence: true,
            advanced_disable_flags: true,
        }, 'control840');
        control.on('eventCaptured', (ev) => eventosControl.push(ev));
    });

    afterAll(() => {
        localStorage.clear();
        sessionStorage.clear();
        delete window.posthog;
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('la app arranca con el autocapture apagado, sin flags remotos y con las máscaras de segunda capa', () => {
        expect(window.posthog.config.autocapture).toBe(false);
        expect(window.posthog.config.advanced_disable_flags).toBe(true);
        expect(window.posthog.config.mask_all_text).toBe(true);
        expect(window.posthog.config.mask_all_element_attributes).toBe(true);
    });

    it('un clic en un chip de salud no produce ningún $autocapture de la app', () => {
        const antes = eventosApp.filter((e) => e.event === '$autocapture').length;
        pulsarChip();
        expect(eventosApp.filter((e) => e.event === '$autocapture').length).toBe(antes);
    });

    it('control: con el autocapture encendido, el mismo clic sí se registraría (con las máscaras, sin su texto)', () => {
        const antes = eventosControl.filter((e) => e.event === '$autocapture').length;
        pulsarChip();
        const nuevos = eventosControl.filter((e) => e.event === '$autocapture').slice(antes);
        expect(nuevos.length).toBe(1);
        expect(JSON.stringify(nuevos[0])).not.toContain(SENSIBLE);
    });
});
