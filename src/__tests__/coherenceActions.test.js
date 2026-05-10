// [P2-HIST-AUDIT-13 · 2026-05-09] Tests del helper SSOT de
// coherence anomalous actions (mirror del backend
// `constants.COHERENCE_ANOMALOUS_ACTIONS`).
//
// Cobertura:
//   1. Set exporta los 4 valores canónicos.
//   2. Set es Set instance (no Array — `has` lookup O(1)).
//   3. isAnomalousCoherenceAction devuelve true para los 4 actions.
//   4. isAnomalousCoherenceAction devuelve false para no-anomalous
//      (`not_applicable`, `post_swap_revalidation`, null, undefined).
//   5. Defensivo contra inputs no-string (number, object, array).

import { describe, it, expect } from 'vitest';
import {
    COHERENCE_ANOMALOUS_ACTIONS,
    isAnomalousCoherenceAction,
} from '../utils/coherenceActions';


describe('[P2-HIST-AUDIT-13] COHERENCE_ANOMALOUS_ACTIONS set', () => {
    it('contiene los 4 actions canónicos', () => {
        const expected = ['degrade', 'reject_minor', 'reject_high', 'hydration_error'];
        for (const a of expected) {
            expect(COHERENCE_ANOMALOUS_ACTIONS.has(a)).toBe(true);
        }
    });

    it('es instancia de Set (lookup O(1))', () => {
        expect(COHERENCE_ANOMALOUS_ACTIONS).toBeInstanceOf(Set);
    });

    it('tiene exactamente 4 entries', () => {
        expect(COHERENCE_ANOMALOUS_ACTIONS.size).toBe(4);
    });

    it('NO incluye actions no-anomalous', () => {
        const not_anomalous = [
            'not_applicable',
            'post_swap_revalidation',
            'null_block_set',
            'none_other',
        ];
        for (const a of not_anomalous) {
            expect(COHERENCE_ANOMALOUS_ACTIONS.has(a)).toBe(false);
        }
    });
});


describe('[P2-HIST-AUDIT-13] isAnomalousCoherenceAction helper', () => {
    it.each([
        ['degrade'],
        ['reject_minor'],
        ['reject_high'],
        ['hydration_error'],
    ])('devuelve true para action canónica %s', (action) => {
        expect(isAnomalousCoherenceAction(action)).toBe(true);
    });

    it.each([
        ['not_applicable'],
        ['post_swap_revalidation'],
        ['unknown_action'],
        [''],
    ])('devuelve false para action no-anomalous %s', (action) => {
        expect(isAnomalousCoherenceAction(action)).toBe(false);
    });

    it.each([
        [null],
        [undefined],
        [42],
        [{ action: 'degrade' }],
        [['degrade']],
        [true],
    ])('devuelve false para input no-string %s', (input) => {
        expect(isAnomalousCoherenceAction(input)).toBe(false);
    });
});
