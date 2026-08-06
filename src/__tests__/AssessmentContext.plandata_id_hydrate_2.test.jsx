// [P1-PLANDATA-ID-HYDRATE-2 · 2026-08-05] «No encontramos tu plan activo» al pulsar
// Actualizar platos justo después de tocar la Nevera.
//
// CASO REAL. El dueño añadió items a su Nevera y pulsó «Actualizar platos» de inmediato:
// error rojo. A los pocos segundos funcionaba. No era lentitud del servidor — era una
// CARRERA: el refresco que dispara la Nevera adoptaba el `plan_data` del servidor, que NO
// trae el `id` (vive en la columna `meal_plans.id`), dejando el estado sin él. El guard de
// `regenerateDay`/`swap` exige `planData?.id || planData?.plan_id` y fallaba hasta que el
// poll de fondo reponía el plan completo.
//
// ⚠️ TERCERA aparición de la clase: P1-PLANDATA-ID-HYDRATE la cerró en el merge nocturno de
// chunks (2026-07-12) y otra vez en el recalc de la Nevera (2026-08-05). Reaparecía porque
// se parcheaba sitio por sitio; por eso ahora hay un helper único.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname_ = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname_, '..', 'context', 'AssessmentContext.jsx'), 'utf-8');

// Réplica NO: se extrae y evalúa el helper real del fichero de producción, para que
// borrarlo allí ponga estos tests en rojo.
const _m = SRC.match(/const conservarPlanId = \(nuevo, previo\) => \{[\s\S]*?\n\};/);
// eslint-disable-next-line no-new-func
const conservarPlanId = _m ? new Function(`${_m[0]}; return conservarPlanId;`)() : null;

describe('[P1-PLANDATA-ID-HYDRATE-2] conservarPlanId', () => {
    it('el helper existe en producción', () => {
        expect(conservarPlanId).toBeTypeOf('function');
    });

    it('EL CASO DEL OWNER: plan_data sin id hereda el del estado previo', () => {
        const r = conservarPlanId({ days: [] }, { id: 'plan-123', days: [] });
        expect(r.id).toBe('plan-123');
    });

    it('acepta plan_id como origen', () => {
        expect(conservarPlanId({ days: [] }, { plan_id: 'p-9' }).id).toBe('p-9');
    });

    it('no pisa un id que el servidor SI trajo', () => {
        expect(conservarPlanId({ id: 'nuevo' }, { id: 'viejo' }).id).toBe('nuevo');
        expect(conservarPlanId({ plan_id: 'nuevo' }, { id: 'viejo' }).id).toBeUndefined();
    });

    it('sin estado previo devuelve el objeto tal cual (no inventa ids)', () => {
        const o = { days: [] };
        expect(conservarPlanId(o, null)).toBe(o);
        expect(conservarPlanId(o, {})).toBe(o);
    });

    it('shape rara no revienta', () => {
        expect(conservarPlanId(null, { id: 'x' })).toBeNull();
        expect(conservarPlanId(undefined, { id: 'x' })).toBeUndefined();
    });
});

describe('[P1-PLANDATA-ID-HYDRATE-2] los callsites', () => {
    it('ningun setPlanData adopta plan_data crudo del servidor', () => {
        // Lo vigilado: que no reaparezca `setPlanData(<algo>.plan_data)` pelado, que es
        // exactamente la forma que causó las tres apariciones.
        // Sin comentarios: el propio comentario que documenta el bug cita la forma
        // prohibida y se contaba a si mismo (falso positivo de la 1a version).
        const codigo = SRC.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join(' ');
        const crudos = [...codigo.matchAll(/setPlanData\(\s*(\w+)\.plan_data\s*\)/g)];
        expect(crudos.map((m) => m[0])).toEqual([]);
    });

    it('y los que adoptan plan_data pasan por el helper', () => {
        expect(SRC).toContain('conservarPlanId(_j.plan_data, prev)');
        expect(SRC).toContain('conservarPlanId(rd.plan_data, prev)');
    });
});
