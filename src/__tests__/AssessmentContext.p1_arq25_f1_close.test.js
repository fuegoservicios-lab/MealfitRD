/**
 * [P1-ARQ25-F1-CLOSE · 2026-09-02] Cierre de la Fase 1 en el frontend: la lista blanca
 * `CAMPOS_DERIVADOS_DEL_SERVIDOR` deja de ser el camino normal.
 *
 *  - revisión del servidor MAYOR  → adopta el plan entero (ya existía, P1-ARQ25-F1-LIFECYCLE);
 *  - revisión IGUAL               → no toca nada (toda escritura de plan_data sube la revisión
 *                                   por trigger, así que "igual" es "idéntico");
 *  - sin revisión (plan legacy)   → merge por lista blanca de siempre.
 *
 * Tests de fuente, como sus hermanos: la regla vive dentro de un callback anidado de
 * `setPlanData` y montar el provider mediría el andamio.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(_dir, '../context/AssessmentContext.jsx'), 'utf8');

describe('P1-ARQ25-F1-CLOSE · hydrateLatestPlan por revisión', () => {
    const adopt = src.indexOf('if (Number.isFinite(srvRev) && Number.isFinite(locRev) && srvRev > locRev) {');
    const same = src.indexOf('if (Number.isFinite(srvRev) && Number.isFinite(locRev) && srvRev === locRev');
    const merge = src.indexOf('const merged = {', same);
    const whitelist = src.indexOf('for (const campo of CAMPOS_DERIVADOS_DEL_SERVIDOR)');

    it('misma revisión ⇒ devuelve prev sin merge (cero churn en el poll)', () => {
        expect(same).toBeGreaterThan(adopt);
        const bloque = src.slice(same, same + 400);
        expect(bloque).toContain('incomingStatus === prev.generation_status');
        expect(bloque).toContain('return prev;');
        expect(bloque).toContain("_tracePlanWrite(`same-rev-${src}`");
    });

    it('la lista blanca queda SOLO para planes sin revisión: va después del guard de igualdad', () => {
        expect(merge).toBeGreaterThan(same);
        expect(whitelist).toBeGreaterThan(merge);
        const decl = src.indexOf('export const CAMPOS_DERIVADOS_DEL_SERVIDOR = Object.freeze([');
        expect(src.slice(Math.max(0, decl - 300), decl)).toContain('SOLO para planes sin `revision`');
    });

    it('adopción por revisión mayor sigue intacta (adopta si viene, nunca borra si falta)', () => {
        const bloque = src.slice(adopt, adopt + 500);
        expect(bloque).toContain('{ ...prev, ...newPlanData, id: prev.id ?? plan?.id, revision: srvRev }');
    });
});
