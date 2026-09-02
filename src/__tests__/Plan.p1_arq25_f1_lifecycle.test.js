/**
 * [P1-ARQ25-F1-LIFECYCLE · 2026-09-02] Bloque 1 vía cola (roadmap 2.5, Fase 1) — lado cliente.
 *
 * Tres contratos:
 *  1. `generateAIPlanStream` crea el run durable (`POST /api/plans/generation-runs`) con
 *     `idempotency_key` y tailea `.../{run_id}/events` SOLO con el flag encendido y usuario
 *     autenticado; con 404 del backend cae al SSE legacy en el mismo intento (I9 + rollback).
 *  2. `hydrateLatestPlan` adopta el plan ENTERO cuando `revision` del servidor > local, sin
 *     borrar lo que el servidor no envía (I12 + regla «adopta si viene, nunca borra si falta»).
 *  3. La clave de idempotencia es estable para el mismo formulario y cambia con él.
 *
 * Como sus hermanos de `AssessmentContext.p1_hydrate_derived_fields`, 1 y 2 leen el fuente:
 * la lógica vive dentro de closures anidadas cuyo montaje mediría el andamio, no la regla.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(_dir, rel), 'utf8');

function sinComentarios(txt) {
    return txt
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*\/\/.*$/, ''))
        .join('\n');
}

describe('P1-ARQ25-F1 · Plan.jsx crea el run durable y tailea sus eventos', () => {
    const src = sinComentarios(read('../pages/Plan.jsx'));

    it('importa el interruptor y la clave de idempotencia de config/generation', () => {
        expect(src).toMatch(/import \{ initialViaQueueEnabled, idempotencyKeyFor, clearIdempotencyKey \} from '\.\.\/config\/generation'/);
    });

    it('sólo va por la cola con el flag y usuario autenticado; el POST lleva idempotency_key', () => {
        const i = src.indexOf("if (initialViaQueueEnabled() && formData?.user_id && formData.user_id !== 'guest')");
        expect(i).toBeGreaterThan(0);
        // [P1-QUEUE-5XX-NO-LEGACY] la ventana crece: entre el POST y el tail viven ahora los reintentos ante 5xx
        const bloque = src.slice(i, i + 3400);
        expect(bloque).toContain("fetchWithRetry('/api/plans/generation-runs'");
        expect(bloque).toContain('idempotency_key: idempotencyKeyFor(formData)');
        expect(bloque).toMatch(/generation-runs\/\$\{encodeURIComponent\(run\.run_id\)\}\/events/);
        // 404 del backend (knob apagado) ⇒ SSE legacy en el mismo intento
        expect(bloque).toContain('runResp.status === 404');
        const legacy = src.indexOf('if (!response) {', i);
        expect(legacy).toBeGreaterThan(i);
        expect(src.slice(legacy, legacy + 400)).toContain('fetchWithRetry(STREAM_URL');
    });

    it('al recibir complete limpia la clave: la próxima generación es otro run', () => {
        const i = src.indexOf("if (eventType === 'complete') {");
        expect(src.slice(i, i + 300)).toContain('clearIdempotencyKey()');
    });
});

describe('P1-ARQ25-F1 · hydrateLatestPlan adopta por revisión', () => {
    const src = sinComentarios(read('../context/AssessmentContext.jsx'));

    it('con revisión del servidor mayor adopta entero, conservando lo local que falte', () => {
        const i = src.indexOf('const srvRev = Number(plan?.revision ?? newPlanData.revision);');
        expect(i).toBeGreaterThan(0);
        const bloque = src.slice(i, i + 700);
        expect(bloque).toContain('srvRev > locRev');
        expect(bloque).toContain('{ ...prev, ...newPlanData, id: prev.id ?? plan?.id, revision: srvRev }');
        expect(bloque).toContain("safeLocalStorageSet('mealfit_plan', adoptedRev)");
        // la rama va ANTES del merge por lista blanca
        const merge = src.indexOf('const merged = {', i);
        expect(merge).toBeGreaterThan(i);
        // y el merge sella la revisión vista
        expect(src.slice(merge, merge + 400)).toContain('...(Number.isFinite(srvRev) ? { revision: srvRev } : {})');
    });
});

describe('P1-ARQ25-F1 · config/generation', () => {
    beforeEach(() => {
        try { sessionStorage.clear(); } catch { /* jsdom */ }
    });

    it('idempotencyKeyFor es estable para el mismo formulario y cambia con él', async () => {
        const { idempotencyKeyFor, clearIdempotencyKey } = await import('../config/generation.js');
        const a = idempotencyKeyFor({ weight: 70, totalDays: 7, tzOffset: -240 });
        const b = idempotencyKeyFor({ totalDays: 7, weight: 70, tzOffset: 0 });
        expect(a).toBe(b);
        const c = idempotencyKeyFor({ weight: 71, totalDays: 7 });
        expect(c).not.toBe(a);
        clearIdempotencyKey();
        const d = idempotencyKeyFor({ weight: 71, totalDays: 7 });
        expect(d).not.toBe(c);
    });

    it('initialViaQueueEnabled sólo es true con VITE_INITIAL_VIA_QUEUE=true', async () => {
        const mod = await import('../config/generation.js');
        // en el entorno de test la env no está fijada ⇒ false por defecto
        expect(mod.initialViaQueueEnabled()).toBe(
            String(import.meta.env.VITE_INITIAL_VIA_QUEUE ?? '').toLowerCase() === 'true'
        );
    });
});


// [P1-QUEUE-5XX-NO-LEGACY · 2026-09-02] Un 5xx de la cola (reinicio) no puede caer al legado.
describe('P1-QUEUE-5XX-NO-LEGACY', () => {
    const src = read('../pages/Plan.jsx');
    it('reintenta la creación del run con esperas crecientes y lanza queue_unavailable si sigue caído', () => {
        expect(src).toContain('const QUEUE_CREATE_RETRY_MS = [4_000, 8_000, 12_000];');
        expect(src).toContain('for (const _espera of QUEUE_CREATE_RETRY_MS)');
        expect(src).toContain("eQ.code = 'queue_unavailable';");
        // el legado queda SOLO para el 404 «cola apagada»: el 5xx ya lanzó antes de llegar ahí
        const i = src.indexOf("eQ.code = 'queue_unavailable';");
        const j = src.indexOf("if (runResp.status === 404) {");
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
    });
    it('si el tail del run no responde ok, reanuda por estado del run en vez del legado', () => {
        const i = src.indexOf('/events`, {');
        const win = src.slice(i, i + 900);
        expect(win).toContain('if (!response.ok) {');
        expect(win).toContain('return await resumeQueueRunUntilReady(run.run_id');
    });
    it('el catch no manda queue_unavailable al fallback síncrono y el caller lo muestra reintentable', () => {
        expect(src).toContain("} else if (error.code === 'queue_unavailable') {");
        expect(src).toContain("if (error.code === 'queue_unavailable') {");
        expect(src).toContain("toast.error(t('El servidor se está actualizando')");
    });
});
