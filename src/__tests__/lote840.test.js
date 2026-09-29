/**
 * [P1-PLAN-LOTE-840 · 2026-09-29] El autocapture de PostHog NO manda el texto ni los atributos de lo que se pulsa
 * (SDK real, no un mock de `init`).
 *
 * `observabilityScope.posthogCaptureOptions` enmascara texto y atributos desde el lote 716 (`mask_all_text`,
 * `mask_all_element_attributes`), pero la Política de Privacidad publicada el 28-sep (§7/§8 y Protección de Datos §5)
 * seguía declarando que un clic en el chip «Diabetes tipo 2» llegaba a PostHog con su texto. Esta prueba ancla el
 * HECHO que la política pasa a describir: se sabe QUÉ control se pulsó, no lo que decía. El control del final
 * desactiva la máscara y comprueba que el mismo clic SÍ deja el texto: sin él, la prueba podría pasar porque el
 * autocapture no hubiera arrancado.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const TOKEN = 'phc_test_lote840';
const SENSIBLE = 'Diabetes tipo 2';

const autocapturas = [];

const pulsarChip = () => {
    const chip = document.createElement('div');
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', SENSIBLE);
    chip.setAttribute('data-valor', SENSIBLE);
    chip.style.cursor = 'pointer';
    chip.textContent = SENSIBLE;
    document.body.appendChild(chip);
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    chip.remove();
};

const ultimaAutocaptura = () => autocapturas[autocapturas.length - 1];

describe('P1-PLAN-LOTE-840 · PostHog no recibe el texto de lo que se pulsa (SDK real)', () => {
    beforeAll(async () => {
        localStorage.clear();
        sessionStorage.clear();
        // Red cortada: nada sale del proceso de test.
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, headers: new Map(), json: async () => ({}), text: async () => '{}',
        })));
        vi.stubGlobal('XMLHttpRequest', class {
            open() {} send() {} setRequestHeader() {} abort() {}
        });
        vi.stubEnv('VITE_POSTHOG_KEY', TOKEN);
        vi.resetModules();
        const cliente = await import('../utils/posthogClient');
        await cliente.initPostHog();
        window.posthog.on('eventCaptured', (ev) => {
            if (ev.event === '$autocapture') autocapturas.push(ev);
        });
    });

    afterAll(() => {
        localStorage.clear();
        sessionStorage.clear();
        delete window.posthog;
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('la app arranca con la máscara de texto y de atributos', () => {
        expect(window.posthog.config.mask_all_text).toBe(true);
        expect(window.posthog.config.mask_all_element_attributes).toBe(true);
    });

    it('un clic en un chip de salud se registra sin su texto ni sus atributos', () => {
        const antes = autocapturas.length;
        pulsarChip();
        expect(autocapturas.length).toBe(antes + 1);
        expect(JSON.stringify(ultimaAutocaptura())).not.toContain(SENSIBLE);
    });

    it('control: sin la máscara, el mismo clic SÍ dejaría el texto (la prueba no pasa en vacío)', () => {
        window.posthog.set_config({ mask_all_text: false, mask_all_element_attributes: false });
        try {
            pulsarChip();
            expect(JSON.stringify(ultimaAutocaptura())).toContain(SENSIBLE);
        } finally {
            window.posthog.set_config({ mask_all_text: true, mask_all_element_attributes: true });
        }
    });
});
