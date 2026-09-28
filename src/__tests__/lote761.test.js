// [P1-PLAN-LOTE-761 · 2026-09-28] La decisión de preguntar al servidor al volver a la app con una respuesta en vuelo.
import { describe, it, expect } from 'vitest';
import { FUERA_MINIMO_MS, debeConsultarAlVolver, servidorYaTermino } from '../utils/vueltaConTurno';

describe('[761] volver con un turno en vuelo', () => {
    it('solo con turno activo y tras un rato fuera', () => {
        expect(debeConsultarAlVolver({ fueraMs: 60_000, turnoActivo: true })).toBe(true);
        expect(debeConsultarAlVolver({ fueraMs: FUERA_MINIMO_MS - 1, turnoActivo: true })).toBe(false);
        expect(debeConsultarAlVolver({ fueraMs: 60_000, turnoActivo: false })).toBe(false);
        expect(debeConsultarAlVolver({ fueraMs: NaN, turnoActivo: true })).toBe(false);
    });
    it('el servidor terminó solo si lo dice explícitamente (un backend viejo sin el campo no corta nada)', () => {
        expect(servidorYaTermino({ turn_active: false })).toBe(true);
        expect(servidorYaTermino({ turn_active: true })).toBe(false);
        expect(servidorYaTermino({})).toBe(false);
        expect(servidorYaTermino(null)).toBe(false);
    });
});
