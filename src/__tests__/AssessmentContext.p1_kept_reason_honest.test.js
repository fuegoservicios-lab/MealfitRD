// [P1-KEPT-REASON-HONEST · 2026-08-05] El aviso de "algunos platos se conservaron"
// dice el motivo REAL, no uno fijo.
//
// Antes esta línea culpaba siempre a la Nevera. Medido en producción el 2026-08-05:
// 26 de 28 reintentos fueron rechazo del guardrail de macros y CERO por despensa,
// con la Nevera del usuario llena — el aviso lo mandaba a comprar comida para
// arreglar un problema de porciones. El backend ya clasificaba la causa
// (`P2-REGEN-DAY-HONEST-CODE`) pero solo en la rama donde no se regeneraba nada;
// la rama parcial se quedó fuera y ahora emite `slots_kept_reason`.
//
// Test parser-based: mismo patrón (y misma razón) que los demás tests de este
// archivo — AssessmentContext.jsx es demasiado pesado para renderizar en unitario.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _src = readFileSync(join(__dirname, '..', 'context', 'AssessmentContext.jsx'), 'utf-8');

// El bloque de la rama `kept.length > 0`, sin sus comentarios: un comentario que
// cite el símbolo buscado haría pasar el test con el arreglo borrado.
function _ramaKept() {
    const i = _src.indexOf('} else if (kept.length > 0) {');
    expect(i, 'no se encontró la rama de slots conservados').toBeGreaterThan(-1);
    const bloque = _src.slice(i, i + 1800);
    return bloque
        .split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n');
}

describe('[P1-KEPT-REASON-HONEST] motivo de los platos conservados', () => {
    it('lee el motivo del backend en vez de asumirlo', () => {
        expect(_ramaKept()).toContain('slots_kept_reason');
    });

    it('tiene copy propio para el fallo del guardrail de macros', () => {
        const bloque = _ramaKept();
        expect(bloque).toMatch(/'ai'/);
        // El caso medido: nada que ver con la Nevera.
        expect(bloque).toMatch(/macros/i);
    });

    it('el copy de la IA NO manda al usuario a la Nevera', () => {
        const bloque = _ramaKept();
        const rama_ai = bloque.slice(bloque.indexOf("=== 'ai'"), bloque.indexOf('Algunos platos se conservaron porque tu Nevera'));
        expect(rama_ai.toLowerCase()).not.toContain('nevera');
    });

    it('conserva el copy de Nevera para el caso que SÍ es de inventario', () => {
        expect(_ramaKept()).toContain('tu Nevera no daba para cambiarlos');
    });
});
