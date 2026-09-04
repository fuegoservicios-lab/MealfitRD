// [P2-WIZARD-NEXT-REQUIRES-FIELDS · 2026-09-04] Captura del dueño: paso 18 («¿Cómo prefieres
// organizar tus comidas?», obligatorio) sin responder y «Siguiente Paso» activo. El bloque de
// navegación del Flow aparece con `canSkip` (ya completó el formulario, o volvió atrás) aunque
// el paso esté vacío, y `nextStep` no valida. Los pasos con hasInternalNext deshabilitan su
// propio NextButton; el del Flow no tenía puerta. Todo paso con `fields` es obligatorio.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FLOW = readFileSync(resolve(process.cwd(), 'src/components/assessment/InteractiveAssessmentFlow.jsx'), 'utf8').split(String.fromCharCode(13)).join('');

describe('wizard: «Siguiente Paso» no deja pasar un paso obligatorio vacío', () => {
    it('el NextButton del Flow va deshabilitado mientras los fields del paso no estén llenos', () => {
        const i = FLOW.indexOf("label={t('Siguiente Paso')}");
        expect(i).toBeGreaterThan(0);
        const btn = FLOW.slice(FLOW.lastIndexOf('<NextButton', i), i);
        expect(btn).toContain('disabled={Array.isArray(currentStepConfig.fields) && currentStepConfig.fields.length > 0 && !stepFieldsFilled}');
    });
    it('los pasos «(Opcional)» no declaran fields: el botón sigue libre ahí', () => {
        for (const title of ['Tu compra y tu cocina (Opcional)', 'Tus básicos de siempre (Opcional)', 'Suplementación (Opcional)']) {
            const i = FLOW.indexOf(`title: t('${title}')`);
            expect(i, title).toBeGreaterThan(0);
            const step = FLOW.slice(i, FLOW.indexOf('component:', i));
            expect(step, title).not.toContain('fields:');
        }
    });
});
