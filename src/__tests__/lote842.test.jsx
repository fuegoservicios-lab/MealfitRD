/**
 * [P1-PLAN-LOTE-842 · 2026-09-29] Pulsar un chip de salud del formulario NO manda ningún `$autocapture` a PostHog.
 *
 * El lote 716 enmascaró el texto y los atributos (`mask_all_text`, `mask_all_element_attributes`), pero el revisor de
 * la sesión 6d lo reprodujo con el SDK real: `$elements` sigue llevando `nth_child`/`nth_of_type`, y los chips de
 * QMedical salen siempre en el mismo orden. Pulsar «Diabetes tipo 2» mandaba `div:nth-child="1"` con la clase
 * `mf-opt-chip`, unido a la cuenta por `identify`: la posición decía qué condición se marcó. La prueba de un solo
 * chip (lote840) no podía verlo.
 *
 * El arreglo es la clase `ph-no-capture` en el contenedor de las preguntas (InteractiveAssessmentFlow) y en la
 * rejilla de Configuración. El SDK recorre los ancestros y descarta el evento entero
 * (posthog-js `autocapture.js`, `explicitNoCapture`). Aquí se prueba con el componente REAL de condiciones médicas y
 * el SDK REAL. El control, sin la clase, emite eventos con la posición: sin él, la prueba podría pasar porque el
 * autocapture no arrancó.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({ formData: { medicalConditions: [], medications: [] }, updateData: () => {} }),
}));

import { QMedical } from '../components/assessment/questions/QMedical';
import RenewalCheckinModal from '../components/plan/RenewalCheckinModal';

const TOKEN = 'phc_test_lote842';
const autocapturas = [];

const chipsDe = (contenedor) => Array.from(contenedor.querySelectorAll('.mf-opt-chip'));

const pulsarVarios = (contenedor, n = 4) => {
    const chips = chipsDe(contenedor).slice(0, n);
    expect(chips.length).toBe(n);
    for (const chip of chips) chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

describe('P1-PLAN-LOTE-842 · los chips de salud no llegan a PostHog (SDK y componente reales)', () => {
    beforeAll(async () => {
        // En el navegador, `index.css` da `cursor: pointer` a `.mf-opt-chip`, y así el autocapture trata al chip
        // (un div role="button") como clicable. jsdom no carga ese CSS: la regla se inyecta aquí, igual que en la app.
        const estilo = document.createElement('style');
        estilo.textContent = '.mf-opt-chip { cursor: pointer; }';
        document.head.appendChild(estilo);
        localStorage.clear();
        sessionStorage.clear();
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, headers: new Map(), json: async () => ({}), text: async () => '{}',
        })));
        vi.stubGlobal('XMLHttpRequest', class {
            open() {} send() {} setRequestHeader() {} abort() {}
        });
        vi.stubEnv('VITE_POSTHOG_KEY', TOKEN);
        const cliente = await import('../utils/posthogClient');
        await cliente.initPostHog();
        window.posthog.on('eventCaptured', (ev) => {
            if (ev.event === '$autocapture') autocapturas.push(ev);
        });
    });

    afterEach(() => cleanup());

    afterAll(() => {
        localStorage.clear();
        sessionStorage.clear();
        delete window.posthog;
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('dentro del contenedor con ph-no-capture, varios chips seguidos no emiten ningún $autocapture', () => {
        const { container } = render(
            <div className="ph-no-capture"><QMedical onManualAdvance={() => {}} nextLabel="Seguir" /></div>,
        );
        const antes = autocapturas.length;
        pulsarVarios(container);
        expect(autocapturas.length).toBe(antes);
    });

    it('control: sin la clase, los mismos clics SÍ emiten eventos, con la posición del chip', () => {
        const { container } = render(<div><QMedical onManualAdvance={() => {}} nextLabel="Seguir" /></div>);
        const antes = autocapturas.length;
        pulsarVarios(container);
        const nuevos = autocapturas.slice(antes);
        expect(nuevos.length).toBeGreaterThan(0);
        expect(JSON.stringify(nuevos)).toMatch(/nth.child/);
    });

    it('el check-in de renovación (hambre y energía: la posición ES el valor) no emite ningún $autocapture', () => {
        const { container } = render(<RenewalCheckinModal onDone={() => {}} />);
        const escalas = Array.from(container.querySelectorAll('button.rc-scale'));
        expect(escalas.length).toBeGreaterThan(3);
        const antes = autocapturas.length;
        for (const b of escalas.slice(0, 4)) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(autocapturas.length).toBe(antes);
    });

    it('los mapas de calor siguen apagados: no miran `ph-no-capture` y llegarían por los flags remotos', () => {
        expect(window.posthog.config.advanced_disable_flags).toBe(true);
    });

    it('la clase está en cada superficie donde la posición delata un dato de salud', () => {
        const leer = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
        expect(leer('../components/assessment/InteractiveAssessmentFlow.jsx'))
            .toMatch(/<div className="ph-no-capture" style=\{\{ display: 'flex', flexDirection: 'column'/);
        // El contenedor ENTERO de Configuración (lista de secciones y diálogos incluidos), no solo la rejilla.
        expect(leer('../pages/Settings.jsx')).toMatch(/<div className=\{`ph-no-capture \$\{styles\.wrapper\}/);
        // Se porta a <body>: no hereda la clase de ningún contenedor.
        expect(leer('../components/common/EvaluarDeNuevoModal.jsx')).toMatch(/className="edn-overlay ph-no-capture"/);
        expect(leer('../components/plan/RenewalCheckinModal.jsx')).toMatch(/<div className="ph-no-capture" style=\{\{/);
        expect(leer('../components/dashboard/WaterTracker.jsx')).toMatch(/className=\{`ph-no-capture \$\{styles\.cups\}`\}/);
    });
});
