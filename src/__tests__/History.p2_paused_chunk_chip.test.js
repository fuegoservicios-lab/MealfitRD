/**
 * [P2-HIST-PAUSED-CHUNK-CHIP · 2026-08-15] La pestaña Métricas no marca «No
 * recuperable» los chunks que la propia pausa canceló.
 *
 * EL BUG. La pausa firma cada chunk que cancela con
 * `dead_letter_reason = '[P1-PLAN-MODE] paused_by_user'`. Esa firma existe
 * precisamente para lo contrario de lo que el chip sugería: es EL contrato por el
 * que `_revive_paused_chunks` sabe cuáles resucitar al reanudar. El backend lo
 * dice con todas las letras (`plan_mode.py:127`): *«dead_lettered_at queda NULL —
 * no es dead-letter»*.
 *
 * Pero el Historial pintaba el chip rojo con un solo criterio —`c.dead_letter_reason`
 * a secas— así que al usuario que pausó le mostraba, en rojo:
 *
 *     No recuperable: [P1-PLAN-MODE] paused_by_user
 *
 * Dos mentiras en una línea: que no es recuperable (es justo lo recuperable) y un
 * marcador interno de ingeniería como texto de producto.
 *
 * EL DISCRIMINADOR YA ESTABA EN EL DATO. Un dead-letter de verdad llega con
 * `status='failed'`; la pausa deja `status='cancelled'`. No hizo falta inventar un
 * campo: hizo falta leer el que ya venía.
 */
import { describe, it, expect } from 'vitest';
import { chipDeChunkMuerto } from '../pages/History';

const FIRMA_PAUSA = '[P1-PLAN-MODE] paused_by_user';

describe('[P2-HIST-PAUSED-CHUNK-CHIP] qué chip merece cada chunk', () => {
    it('un chunk cancelado por la pausa NO es «no recuperable»', () => {
        const chip = chipDeChunkMuerto({ status: 'cancelled', dead_letter_reason: FIRMA_PAUSA });
        expect(chip).toBeTruthy();
        expect(chip.tono).toBe('neutro');
        expect(chip.texto).not.toMatch(/no recuperable/i);
    });

    it('y no le enseña al usuario el marcador interno', () => {
        const chip = chipDeChunkMuerto({ status: 'cancelled', dead_letter_reason: FIRMA_PAUSA });
        expect(chip.texto).not.toMatch(/P1-PLAN-MODE/);
        expect(chip.texto).not.toMatch(/paused_by_user/);
        expect(chip.texto).toMatch(/pausa/i);
    });

    it('un fallo REAL sigue siendo rojo y conserva su razón', () => {
        const chip = chipDeChunkMuerto({ status: 'failed', dead_letter_reason: 'llm_timeout tras 3 intentos' });
        expect(chip.tono).toBe('malo');
        expect(chip.texto).toMatch(/No recuperable/);
        expect(chip.texto).toMatch(/llm_timeout/);
    });

    it('sin razón de muerte no hay chip', () => {
        expect(chipDeChunkMuerto({ status: 'completed' })).toBeNull();
        expect(chipDeChunkMuerto({ status: 'pending', dead_letter_reason: '' })).toBeNull();
        expect(chipDeChunkMuerto(null)).toBeNull();
    });

    it('un cancelado por OTRA causa no se disfraza de pausa', () => {
        // Cancelar no siempre es pausar: si aparece otra firma, el usuario merece
        // verla en vez de que se la escondamos bajo «en pausa».
        const chip = chipDeChunkMuerto({ status: 'cancelled', dead_letter_reason: 'plan borrado por el usuario' });
        expect(chip.texto).toMatch(/plan borrado/);
        expect(chip.texto).not.toMatch(/pausa/i);
    });
});
