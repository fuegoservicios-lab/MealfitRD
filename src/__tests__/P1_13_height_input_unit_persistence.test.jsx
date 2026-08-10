/**
 * Tests P1-13: la unidad del input de altura (`cm` vs `ft`) sobrevive al
 * remount de QMeasurements al navegar con prevStep.
 *
 * Bug original (audit P1-13):
 *   `unit`/`feet`/`inches` eran `useState` local del componente
 *   QMeasurements, no formData. Si el usuario tipeaba en ft (`unit='ft'`),
 *   avanzaba a QActivityLevel y volvía con prevStep, el componente se
 *   remontaba con `unit='cm'` por default. El display mostraba la altura
 *   en cm (e.g. 178) sin contexto de que él había estado tipeando en ft.
 *   Riesgo concreto de re-tipeo erróneo en zona métrica/imperial mixta
 *   (US-expat).
 *
 * Fix:
 *   1. Nuevo `_heightInputUnit` en `initialFormData` (default 'cm').
 *   2. QMeasurements deriva `unit` de `formData._heightInputUnit` en lugar
 *      de `useState` local; `setUnit` propaga a formData via `updateData`.
 *   3. El prefijo `_` lo trata como flag interno (filtrado por
 *      `stripInternalFlags` y NO persistido a `health_profile`); persiste
 *      solo en localStorage para sobrevivir refresh y prevStep.
 *   4. `feet`/`inches` siguen como `useState` local pero el `useEffect`
 *      existente los rehidrata desde `formData.height` al remount cuando
 *      `unit === 'ft'`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CTX_PATH = path.resolve(__dirname, '..', 'context', 'AssessmentContext.jsx');
// [P2-4 · 2026-07-09] QMeasurements vive en su propio archivo tras el split
// mecánico de InteractiveQuestions.jsx (que quedó como barrel de re-export).
const QSRC_PATH = path.resolve(__dirname, '..', 'components', 'assessment', 'questions', 'QMeasurements.jsx');

const ctxSrc = fs.readFileSync(CTX_PATH, 'utf-8');
const ctxCode = ctxSrc
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');

const qSrc = fs.readFileSync(QSRC_PATH, 'utf-8');
const qCode = qSrc
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');


describe('P1-13 — initialFormData declara _heightInputUnit', () => {
    const blockMatch = ctxCode.match(
        /const\s+initialFormData\s*=\s*\{([\s\S]*?)\n\s*\};/
    );
    const initialBlock = blockMatch ? blockMatch[1] : '';

    it('initialFormData contiene `_heightInputUnit: \'ft\'`', () => {
        // [FT-DEFAULT-PRESELECT · 2026-05-31] Default cambiado de 'cm' a 'ft'
        // (paridad con weightUnit:'lb'; mercado es-DO usa imperial). La altura
        // SIEMPRE se persiste en cm internamente — esto solo es el input.
        expect(initialBlock).toMatch(/_heightInputUnit:\s*['"]ft['"]/);
    });

    it('Comentario [P1-13] documenta el rationale en initialFormData', () => {
        expect(ctxSrc).toMatch(/\[P1-13\]/);
    });

    it('La key tiene prefijo `_` para que stripInternalFlags la filtre del payload backend', () => {
        // El invariante centralizado de P1-8: `_*` se filtra antes del envío.
        // Esto significa que `_heightInputUnit` NO contamina el contexto del
        // LLM ni se persiste en `health_profile`.
        expect(initialBlock).toMatch(/^\s+_heightInputUnit:/m);
    });
});


describe('P1-13 — QMeasurements deriva unit de formData', () => {
    it('NO usa `useState(\'cm\')` para `unit`', () => {
        // Defensa contra reintroducir el patrón roto. El bug era exactamente
        // `const [unit, setUnit] = useState('cm');` que reset al remount.
        const badPattern = /const\s*\[\s*unit\s*,\s*setUnit\s*\]\s*=\s*useState\(/;
        expect(qCode).not.toMatch(badPattern);
    });

    it('Lee `unit` de `formData._heightInputUnit`', () => {
        // Patrón canónico: `const unit = formData._heightInputUnit || 'ft';`.
        // [FT-DEFAULT-PRESELECT · 2026-05-31] Fallback 'ft' (era 'cm').
        const derivedPattern = /const\s+unit\s*=\s*formData\._heightInputUnit\s*\|\|\s*['"]ft['"]/;
        expect(qCode).toMatch(derivedPattern);
    });

    it('`setUnit` persiste vía updateData (no setState local)', () => {
        // Patrón canónico: `const setUnit = (newUnit) => updateData('_heightInputUnit', newUnit);`.
        const persistPattern = /const\s+setUnit\s*=\s*\(\s*newUnit\s*\)\s*=>\s*updateData\(\s*['"]_heightInputUnit['"]\s*,\s*newUnit\s*\)/;
        expect(qCode).toMatch(persistPattern);
    });

    it('Comentario [P1-13] documenta el rationale en QMeasurements', () => {
        expect(qSrc).toMatch(/\[P1-13\]/);
    });
});


describe('P1-13 — useEffect re-hidrata feet/inches desde height al remount', () => {
    it('useEffect existente sigue calculando feet/inches cuando unit===ft', () => {
        // El effect existente debe seguir intacto: condición clave es
        // `unit === 'ft' && formData.height && !feet && !inches`.
        const effectPattern = /unit\s*===\s*['"]ft['"]\s*&&\s*formData\.height\s*&&\s*!feet\s*&&\s*!inches/;
        expect(qCode).toMatch(effectPattern);
    });
});


describe('P1-13 — Toggle de unit dispara persistencia', () => {
    it('El toggle CM/FT sigue pasando por setUnit (no setState directo)', () => {
        // [P1-UNIT-TOGGLE · 2026-08-10] Este caso buscaba los `onClick` en línea de dos
        // botones escritos a mano. Esos botones ya no existen: los tres selectores de
        // unidad del formulario (CM/FT, LB/KG, RD$/US$) se unificaron en `UnitToggle`
        // porque los de medidas median 22px con cero separación entre objetivos.
        //
        // Lo que este caso protege NO ha cambiado: que el cambio de unidad pase por
        // `setUnit` —que es quien persiste `_heightInputUnit`— y no por un `setState`
        // suelto que lo perdería. Solo cambia dónde mirar: antes en el `onClick` de cada
        // botón, ahora en el `onChange` del control compartido.
        const toggle = qCode.match(/<UnitToggle[\s\S]{0,400}?\/>/);
        expect(toggle).toBeTruthy();
        expect(toggle[0]).toMatch(/onChange=\{\s*setUnit\s*\}/);
        // Y sigue ofreciendo las dos unidades.
        expect(toggle[0]).toMatch(/'cm'/);
        expect(toggle[0]).toMatch(/'ft'/);
    });
});


describe('P1-13 — _heightInputUnit es flag interno (prefijo _)', () => {
    it('La key es filtrada por stripInternalFlags (P1-8 invariante)', () => {
        // Si `stripInternalFlags(formData)` se aplica antes del envío al
        // backend (Plan.jsx), `_heightInputUnit` NO debe llegar al payload
        // ni al LLM. Test indirecto: buscamos que la key tenga prefijo `_`.
        // (El test funcional de stripInternalFlags vive en P1_8.)
        expect(ctxCode).toMatch(/_heightInputUnit/);
        // No hay nombre alternativo sin prefijo (que se filtraría).
        expect(ctxCode).not.toMatch(/[^_]heightInputUnit/);
    });
});
