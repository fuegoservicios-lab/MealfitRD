/**
 * [P1-PLAN-POLL-BOUNDED · 2026-07-29] Test parser-based (evita importar Dashboard.jsx
 * completo — árbol de dependencias pesado, mismo patrón que
 * `Dashboard.p3_banner_reason_copy.test.js`) del lado Dashboard.jsx del bucle acotado.
 *
 * Reviewer adversarial (2026-07-29): el commit que introdujo `usePlanPollLoop` tenía
 * cobertura completa del lado AssessmentContext (`PlanHydrateOnComplete.test.js`,
 * `usePlanPollLoop.test.jsx`) pero CERO tests referenciaban `_dashPollTick`, la llamada
 * a `usePlanPollLoop({...})` de Dashboard.jsx (~línea 1743), o la condición del banner
 * "Dejamos de revisar…" (~línea 6280) — pese a que el propio mensaje del commit afirma
 * arreglar "Dashboard's 30s /chunk-status loop" con la misma forma. Una reversión de
 * `enabled: planData?.generation_status === 'partial' && !!planData?.id` a un interval
 * incondicional, o de la condición del banner, habría pasado con la suite en verde.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASH = readFileSync(join(__dirname, '..', 'pages', 'Dashboard.jsx'), 'utf-8');

describe('[P1-PLAN-POLL-BOUNDED] Dashboard.jsx usa usePlanPollLoop (no un setInterval incondicional)', () => {
    it('importa usePlanPollLoop', () => {
        expect(DASH).toMatch(/import \{ usePlanPollLoop \} from '\.\.\/hooks\/usePlanPollLoop'/);
    });

    it('`_dashPollTick` computa daysCount/generationStatus/chunkStatus desde planData fresco (ref, no closure stale)', () => {
        const i = DASH.indexOf('const _dashPollTick = useCallback(');
        expect(i).toBeGreaterThan(-1);
        const end = DASH.indexOf('usePlanPollLoop({', i);
        expect(end).toBeGreaterThan(i);
        const body = DASH.slice(i, end);
        expect(body).toMatch(/const latest = _dashPlanDataRef\.current;/);
        expect(body).toMatch(/daysCount: Array\.isArray\(latest\?\.days\) \? latest\.days\.length : 0,/);
        expect(body).toMatch(/generationStatus: latest\?\.generation_status \?\? null,/);
        expect(body).toMatch(/chunkStatus,/);
        // Trae el discriminador real vía el mismo helper que el chip de estado del chunk.
        expect(body).toMatch(/getPlanChunkStatus\(_planId\)/);
    });

    it('la llamada a usePlanPollLoop tiene el gate EXACTO del setInterval reemplazado (solo \'partial\' + plan con id)', () => {
        const i = DASH.indexOf('usePlanPollLoop({');
        expect(i).toBeGreaterThan(-1);
        const body = DASH.slice(i, i + 400);
        expect(body).toMatch(/enabled:\s*planData\?\.generation_status === 'partial' && !!planData\?\.id,/);
        expect(body).toMatch(/resetKey:\s*planData\?\.id,/);
        expect(body).toMatch(/tick:\s*_dashPollTick,/);
    });

    it('el gate no es un setInterval incondicional residual (regression guard directo)', () => {
        // El comentario que documenta el reemplazo precede a `_dashPollTick`, que a su
        // vez precede a la llamada — orden relativo, no una ventana de bytes fija (ver
        // memoria de sesión: ventanas fijas caducan cuando el cuerpo intermedio crece).
        const iComment = DASH.indexOf('Bucle ACOTADO que reemplaza el');
        const iTick = DASH.indexOf('const _dashPollTick = useCallback(');
        const iCall = DASH.indexOf('usePlanPollLoop({');
        expect(iComment).toBeGreaterThan(-1);
        expect(iComment).toBeLessThan(iTick);
        expect(iTick).toBeLessThan(iCall);
        expect(DASH.slice(iComment, iComment + 200)).toMatch(/`setInterval\(\.\.\.,30000\)`/);
    });
});

describe('[P1-PLAN-POLL-BOUNDED] banner "Dejamos de revisar" (give-up) en Dashboard.jsx', () => {
    it('planPollGaveUp se toma del contexto (AssessmentContext), NO de la llamada local a usePlanPollLoop', () => {
        // Dashboard.jsx tiene su PROPIA llamada a usePlanPollLoop (arriba) que NO pasa
        // onGiveUpChange — el flag que alimenta el banner viene del loop de
        // AssessmentContext (SSOT único de "nuevas semanas"). Si alguien empieza a pasar
        // onGiveUpChange en la llamada local sin togar esto, tendríamos DOS escritores
        // de la misma UI — este test documenta la intención actual para que un cambio
        // futuro sea deliberado, no accidental.
        expect(DASH).toMatch(/planPollGaveUp,\s*\n\s*\} = useAssessment\(\);/);
        const i = DASH.indexOf('usePlanPollLoop({');
        const body = DASH.slice(i, i + 400);
        expect(body).not.toMatch(/onGiveUpChange/);
    });

    it('la condición de render del banner exige give-up + plan no corrupto + generación partial', () => {
        const i = DASH.indexOf('{planPollGaveUp && !isPlanCorrupted');
        expect(i).toBeGreaterThan(-1);
        const line = DASH.slice(i, i + 120);
        expect(line).toMatch(/planPollGaveUp && !isPlanCorrupted && planData\?\.generation_status === 'partial'/);
    });

    it('el CTA del banner fuerza una hidratación manual (src identificable en logs)', () => {
        const i = DASH.indexOf('{planPollGaveUp && !isPlanCorrupted');
        const body = DASH.slice(i, i + 2200);
        expect(body).toMatch(/hydrateLatestPlan\?\.\(\{ force: true, src: 'give-up-retry' \}\);/);
    });
});
