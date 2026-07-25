/**
 * [P1-PLANPAGE-HYDRATE-ON-ACK · 2026-07-25] "Vuelve a pasar": el plan no se actualiza
 * al llegar al dashboard y hay que refrescar a mano.
 *
 * Ya lo habíamos cerrado en `PendingPipelineRecovery` (P1-PLAN-HYDRATE-ON-COMPLETE) y volvió,
 * porque **`Plan.jsx` tenía dos copias más del mismo patrón** — y esa página corre primero.
 *
 * Evidencia en vivo (generación 25/07, corr=00471349):
 *
 *   backend  14:03:16  "Pipeline OK pero SSE generator murió pre-postproceso"
 *   nginx    14:04:29  POST /api/plans/pending-status/ack
 *   nginx    14:04:33  GET  /api/plans/pending-status
 *   nginx    ——        GET  /api/plans-data/latest?src=recovery   ← NUNCA
 *   nginx    14:42     12× src=poll · 22× src=wake  (38 min después, al volver)
 *
 * Los dos caminos de `Plan.jsx` hacían: `ack` → borrar flag → `navigate('/dashboard')`, sin
 * traer el plan. Y como **el ack CONSUME el `complete`**, el recuperador —que sí hidrata— veía
 * después `status:'none'` y no hacía nada. De ahí el cero `src=recovery`.
 *
 * El poll y el wake tampoco rescatan el caso: usan el camino conservador, y con ids distintos
 * y un plan local CON días el guard devuelve el local (correcto para "adivino cuál es el plan",
 * inútil aquí). Resultado: el usuario ve el plan viejo hasta refrescar.
 *
 * Misma lección que el bolt-on del 2026-07-11: **blindar un camino no basta, hay que contar los
 * caminos.** El comentario del recuperador ("Autenticado: el dashboard lo carga solo") era la
 * suposición falsa, duplicada aquí.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _read = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf-8');

const PLAN = _read('pages', 'Plan.jsx');
const REC = _read('components', 'PendingPipelineRecovery.jsx');


describe('[P1-PLANPAGE-HYDRATE-ON-ACK] todo camino que ackea, hidrata antes', () => {
    it('Plan.jsx obtiene hydrateLatestPlan del contexto', () => {
        expect(PLAN).toMatch(/hydrateLatestPlan\s*\}\s*=\s*useAssessment\(\)/s);
    });

    it('CADA llamada a /pending-status/ack va precedida de una hidratación', () => {
        // El contrato que impide la regresión: no importa cuántos caminos haya, ninguno puede
        // consumir el `complete` sin traer antes el plan.
        const acks = [...PLAN.matchAll(/pending-status\/ack/g)].map((m) => m.index);
        expect(acks.length).toBeGreaterThanOrEqual(2);
        for (const i of acks) {
            const antes = PLAN.slice(Math.max(0, i - 1400), i);
            expect(antes).toMatch(/hydrateLatestPlan\?\.\(\{[^}]*expectPlanId/);
        }
    });

    it('la hidratación usa expectPlanId (adopta) y no el camino conservador', () => {
        // Sin `expectPlanId`, el guard de plan-id devuelve el plan LOCAL cuando los ids difieren
        // y el local tiene días — que es exactamente el caso aquí.
        const llamadas = [...PLAN.matchAll(/hydrateLatestPlan\?\.\(\{([^}]*)\}\)/g)];
        expect(llamadas.length).toBeGreaterThanOrEqual(2);
        for (const c of llamadas) {
            expect(c[1]).toMatch(/force:\s*true/);
            expect(c[1]).toMatch(/expectPlanId:/);
            expect(c[1]).toMatch(/src:\s*'plan-page'/);
        }
    });

    it('cada hidratación precede a su navigate al dashboard', () => {
        for (const c of PLAN.matchAll(/hydrateLatestPlan\?\.\(\{[^}]*\}\)/g)) {
            const nav = PLAN.indexOf("navigate('/dashboard'", c.index);
            expect(nav).toBeGreaterThan(c.index);
        }
    });

    it('el recuperador conserva SUS hidrataciones (no se movió el problema de sitio)', () => {
        const h = [...REC.matchAll(/hydrateLatestPlanRef\.current\?\.\(\{[^}]*src: 'recovery'[^}]*\}\)/g)];
        expect(h.length).toBe(2);
    });

    it('`src` distingue el camino en el log del servidor', () => {
        // Diagnosticar esto costó dos intentos la vez anterior; el src es lo que lo hizo
        // resoluble en una consulta de nginx.
        expect(PLAN).toMatch(/src:\s*'plan-page'/);
        expect(REC).toMatch(/src:\s*'recovery'/);
    });
});
