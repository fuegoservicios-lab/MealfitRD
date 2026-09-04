// [P2-WIZARD-NAV-GAP-UNIFORM · 2026-09-04] Dos capturas del dueño: en unos pasos «Siguiente» y
// «Saltar a la última pregunta» iban a 12 px y en otros a 32 px. Los segundos son los pasos con
// `hasInternalNext`: el «Siguiente» lo pinta la pregunta (NextButton con marginTop 2rem) y el
// bloque de navegación del Flow, que ahí solo trae «Saltar…», añadía sus propios 2rem encima.
// La distancia botón → botón es una sola (gap 0.75rem); los 2rem son contenido → botones.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('wizard: la distancia entre «Siguiente» y «Saltar…» es la misma en todos los pasos', () => {
    it('el bloque de navegación no suma sus 2rem al NextButton interno', () => {
        const flow = read('src/components/assessment/InteractiveAssessmentFlow.jsx');
        const i = flow.indexOf("marginTop: currentStepConfig.hasInternalNext ? '0.75rem' : '2rem',");
        expect(i).toBeGreaterThan(0);
        const block = flow.slice(i, i + 400);
        expect(block).toContain("gap: '0.75rem',");
        // el NextButton interno sigue separando el contenido con sus 2rem: no se toca
        const next = read('src/components/assessment/questions/NextButton.jsx');
        expect(next).toContain("marginTop: '2rem',");
    });
});
