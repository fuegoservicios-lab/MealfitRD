/**
 * [P1-GENERATE-TURNS-MODE-ON · 2026-08-14] Generar un plan desde el contador
 * devuelve al usuario al dashboard del PLAN, no al contador con una nota de pausa.
 *
 * EL BUG. El usuario en modo contador pulsa «Encender el plan», rellena el wizard,
 * paga su crédito y recibe el plan por SSE… y aterriza otra vez en el contador,
 * que además llama «en pausa» al plan que acaba de generarse.
 *
 * DÓNDE ESTABA (y dónde NO). El backend hace su parte: `ensure_plan_generation_enabled`
 * (routers/plans.py:2097) pone `user_profiles.plan_mode='plan'` al generar —
 * «generar un plan ES el consentimiento de generar», dice su docstring. Lo que
 * fallaba era el lado cliente: `isTrackingMode` lee `userProfile?.plan_mode` PRIMERO
 * y el espejo `mealfit_plan_mode` después, y en ese instante los dos siguen
 * diciendo 'tracking' — el perfil en contexto se cargó al entrar y nadie lo
 * refrescó. La verdad ya había cambiado en la DB y la pantalla no se enteraba.
 *
 * EL ARREGLO es el patrón que este repo ya escribió para reanudar (`planModeResume.js`):
 * *«el espejo localStorage se escribe ANTES del reload — sin él aterrizaría otra vez
 * en el contador»*. Aquí no hay reload, pero el problema es el mismo y la cura
 * también: al confirmarse la generación se escribe el espejo, que es justo el
 * respaldo que `isTrackingMode` consulta cuando el perfil viene stale o lento.
 *
 * NO se hace un PUT a /api/profile/plan-mode desde aquí: sería pedirle al servidor
 * que haga algo que ya hizo, y un segundo escritor del mismo campo es una carrera
 * esperando ocurrir. El cliente solo se pone al día.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { marcarModoPlanTrasGenerar } from '../utils/planModeMirror';
import { isTrackingMode } from '../config/dashboardNav';

beforeEach(() => window.localStorage.clear());

describe('[P1-GENERATE-TURNS-MODE-ON] el espejo se pone al día', () => {
    it('tras generar, el espejo dice «plan»', () => {
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        marcarModoPlanTrasGenerar();
        expect(window.localStorage.getItem('mealfit_plan_mode')).toBe('plan');
    });

    it('y con eso el SSOT deja de reportar modo contador', () => {
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        // El perfil todavía viene stale del backend: es el caso real.
        expect(isTrackingMode({ id: 'u1' }, null)).toBe(true);
        marcarModoPlanTrasGenerar();
        expect(isTrackingMode({ id: 'u1' }, null)).toBe(false);
    });

    it('es idempotente y no revienta sin localStorage', () => {
        marcarModoPlanTrasGenerar();
        marcarModoPlanTrasGenerar();
        expect(window.localStorage.getItem('mealfit_plan_mode')).toBe('plan');
    });
});

describe('[P1-GENERATE-TURNS-MODE-ON] el cableado', () => {
    it('saveGeneratedPlan lo invoca: es el punto post-SSE de éxito', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const src = fs.readFileSync(
            path.resolve(process.cwd(), 'src/context/AssessmentContext.jsx'), 'utf-8');
        const i = src.indexOf('const saveGeneratedPlan');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 4000)).toMatch(/marcarModoPlanTrasGenerar\(\)/);
    });

    it('el perfil en contexto también se corrige, no solo el espejo', async () => {
        // El SSOT lee el PERFIL primero: dejar solo el espejo arreglaría el caso
        // del reload y no el de seguir navegando sin recargar.
        const fs = await import('node:fs');
        const path = await import('node:path');
        const src = fs.readFileSync(
            path.resolve(process.cwd(), 'src/context/AssessmentContext.jsx'), 'utf-8');
        const i = src.indexOf('const saveGeneratedPlan');
        expect(src.slice(i, i + 4000)).toMatch(/plan_mode:\s*['"]plan['"]/);
    });
});
