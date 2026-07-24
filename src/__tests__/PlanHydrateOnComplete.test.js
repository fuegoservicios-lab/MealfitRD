/**
 * [P1-PLAN-HYDRATE-ON-COMPLETE · 2026-07-24] Tests parser-based del camino
 * "el pipeline terminó → la UI se entera SIN refrescar".
 *
 * Bug reportado en vivo (generación corr=3cd0baa9, 2026-07-24):
 *   El usuario generó un plan de 30 días. A los 3 minutos el SSE se cortó
 *   (refresh/navegación) — el backend SIGUIÓ y terminó bien 4 minutos después:
 *   plan a060108b con banda 1.00, 3 días, 51 ítems de lista y 7 chunks encolados.
 *
 *   El backend marcó el KV `pending_pipeline` como `complete` con `plan_id_final`,
 *   y el frontend SÍ estaba polleando /api/plans/pending-status (200 OK cada 10s).
 *   Pero al detectar `complete` el recuperador solo hacía:
 *
 *       navigate('/dashboard', { replace: true });
 *
 *   …que es **no-op cuando el usuario ya está en /dashboard**: ni re-render ni
 *   fetch. `planData` seguía siendo el placeholder `partial` + `days: []`, que es
 *   exactamente la condición de `isPlanCorrupted` → banner rojo "Tu plan quedó
 *   incompleto" con CTA a regenerar (que además cancela los chunks del plan bueno).
 *   Único escape: refrescar a mano. Palabras del owner: "tuve que refrescar la web
 *   para que me saliera el resultado del plan".
 *
 * Fix (3 piezas):
 *   1. `hydrateLatestPlan` en AssessmentContext = SSOT de "traer el plan del
 *      servidor y adoptarlo" (extraído del poll de 25s, que ahora lo reusa).
 *   2. El recuperador lo llama al ver `complete`, ANTES de navegar.
 *   3. El guard de plan-id no puede bloquear la adopción cuando el plan local no
 *      tiene días (no hay nada que proteger) — si no, el placeholder se queda fijo.
 *   4. El banner no se muestra mientras haya una generación en vuelo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _read = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf-8');

const CTX = _read('context', 'AssessmentContext.jsx');
const REC = _read('components', 'PendingPipelineRecovery.jsx');
const DASH = _read('pages', 'Dashboard.jsx');
const FLAG = _read('utils', 'pendingPipelineFlag.js');

const MARKER = /\[P1-PLAN-HYDRATE-ON-COMPLETE\s*·\s*2026-07-24\]/;


describe('[P1-PLAN-HYDRATE-ON-COMPLETE] SSOT de hidratación', () => {
    it('AssessmentContext expone hydrateLatestPlan', () => {
        expect(MARKER.test(CTX)).toBe(true);
        expect(CTX).toMatch(/const hydrateLatestPlan = useCallback\(/);
        // Debe viajar en el value del provider (si no, el recuperador no puede usarla).
        const i = CTX.indexOf('const contextValue');
        expect(CTX.slice(i)).toMatch(/^\s*hydrateLatestPlan,\s*$/m);
    });

    it('pide el plan al backend y solo adopta estados vivos', () => {
        const i = CTX.indexOf('const hydrateLatestPlan = useCallback(');
        const body = CTX.slice(i, i + 4200);
        expect(body).toMatch(/fetchWithAuth\('\/api\/plans-data\/latest'\)/);
        expect(body).toMatch(/incomingStatus !== 'partial' && incomingStatus !== 'complete'/);
    });

    it('el poll de 25s reusa la MISMA función (cero cuerpo inline duplicado)', () => {
        expect(CTX).toMatch(/const pollLatestPlan = \(\) => hydrateLatestPlan\(/);
        // Dentro del effect del poll no puede quedar un fetch propio: si el merge vive
        // en dos sitios, el fix del guard de plan-id se aplica solo en uno.
        const start = CTX.indexOf('const pollLatestPlan = () => hydrateLatestPlan(');
        const end = CTX.indexOf('}, [session?.user?.id, planData?.generation_status', start);
        expect(end).toBeGreaterThan(start);
        expect(CTX.slice(start, end)).not.toMatch(/fetchWithAuth/);
    });

    it('un placeholder sin días NO bloquea la adopción del plan del servidor', () => {
        const i = CTX.indexOf('const hydrateLatestPlan = useCallback(');
        const body = CTX.slice(i, i + 4200);
        // El guard de id sigue existiendo…
        expect(body).toMatch(/if \(prev\.id && plan\.id && prev\.id !== plan\.id\)/);
        // …pero con la salida para el caso "no hay días que proteger".
        expect(body).toMatch(/const prevHasDays = Array\.isArray\(prev\.days\) && prev\.days\.length > 0/);
        expect(body).toMatch(/if \(prevHasDays\) return prev/);
    });
});


describe('[P1-PLAN-HYDRATE-ON-COMPLETE] el recuperador hidrata antes de navegar', () => {
    it('obtiene hydrateLatestPlan del contexto', () => {
        expect(REC).toMatch(/const \{[^}]*hydrateLatestPlan[^}]*\} = useAssessment\(\)/);
        expect(REC).toMatch(/hydrateLatestPlanRef/);
    });

    it('LOS DOS caminos de `complete` hidratan ANTES del navigate', () => {
        // Boot single-shot y poll: ambos terminan en navigate('/dashboard').
        const navs = REC.match(/navigate\('\/dashboard', \{ replace: true \}\)/g) || [];
        expect(navs.length).toBe(2);

        const hydrates = [...REC.matchAll(/hydrateLatestPlanRef\.current\?\.\(\{ force: true \}\)/g)];
        expect(hydrates.length).toBe(2);

        // Orden: cada hidratación precede a su navigate.
        for (const h of hydrates) {
            const nextNav = REC.indexOf("navigate('/dashboard'", h.index);
            expect(nextNav).toBeGreaterThan(h.index);
        }
    });
});


describe('[P1-PLAN-HYDRATE-ON-COMPLETE] el banner no miente durante la generación', () => {
    it('isPlanCorrupted exige que NO haya pipeline en vuelo', () => {
        const i = DASH.indexOf('const isPlanCorrupted');
        const body = DASH.slice(i, i + 700);
        expect(body).toMatch(/&& !hasPendingPipelineInFlight\(\)/);
        // `failed` sigue mostrándose siempre — es veredicto del backend.
        expect(body).toMatch(/generation_status === 'failed'/);
    });

    it('el helper vive en un módulo propio y la clave no se duplica', () => {
        // Módulo propio (no exportado desde el componente: rompe fast-refresh, y el
        // linter lo dice explícitamente — "use a new file to share functions").
        expect(DASH).toMatch(
            /import \{ hasPendingPipelineInFlight \} from '\.\.\/utils\/pendingPipelineFlag'/
        );
        expect(FLAG).toMatch(/export function hasPendingPipelineInFlight\(\)/);
        // La clave de localStorage vive en UN solo módulo: los otros dos la importan.
        expect(FLAG).toMatch(/const LS_KEY = 'mealfit_plan_in_progress'/);
        expect(DASH).not.toMatch(/mealfit_plan_in_progress/);
        expect(REC).not.toMatch(/const LS_KEY/);
        expect(REC).toMatch(/from '\.\.\/utils\/pendingPipelineFlag'/);
    });
});
