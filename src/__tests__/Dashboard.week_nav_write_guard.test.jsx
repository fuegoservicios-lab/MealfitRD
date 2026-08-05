// [P1-DASH-WEEK-NAV · 2026-08-04] El guard que impide que la navegación por
// semanas corrompa datos.
//
// `activeDayIndex` nunca fue solo selección visual: es la DIRECCIÓN DE
// ESCRITURA del swap (`/swap-meal/persist` escribe con la ruta jsonb
// `{days,<i>,meals,<j>}`) y de `regenerateDay`. Al mostrar también días
// ARCHIVADOS —que viven en `_archived_days`, con su PROPIO rango de índices—
// mezclar los dos rangos haría que "Cambiar Plato" reescribiera otro día.
import { describe, it, expect } from 'vitest';
import { writableDayIndex } from '../utils/planWeeks';

describe('[P1-DASH-WEEK-NAV] writableDayIndex', () => {
    it('un dia vivo devuelve su indice en days (la direccion de escritura)', () => {
        expect(writableDayIndex({ origen: 'vivo', idx: 2 })).toBe(2);
        expect(writableDayIndex({ origen: 'vivo', idx: 0 })).toBe(0);
    });

    it('un dia archivado NO devuelve indice: no hay nada que escribir', () => {
        expect(writableDayIndex({ origen: 'archivado', idx: 0 })).toBeNull();
        expect(writableDayIndex({ origen: 'archivado', idx: 5 })).toBeNull();
    });

    it('un dia futuro tampoco: no existe todavia', () => {
        expect(writableDayIndex({ origen: 'futuro', idx: null })).toBeNull();
        expect(writableDayIndex({ origen: 'futuro', idx: 3 })).toBeNull();
    });

    it('shape rara o nula devuelve null, nunca 0 por accidente', () => {
        expect(writableDayIndex(null)).toBeNull();
        expect(writableDayIndex(undefined)).toBeNull();
        expect(writableDayIndex({})).toBeNull();
        expect(writableDayIndex({ origen: 'vivo' })).toBeNull();
        expect(writableDayIndex({ origen: 'vivo', idx: '1' })).toBeNull();
        expect(writableDayIndex({ origen: 'vivo', idx: 1.5 })).toBeNull();
    });

    it('el indice 0 de un archivado NO se confunde con el 0 de un vivo', () => {
        // El caso exacto que corrompe datos: ambos son "el dia 0" de su propia
        // coleccion, pero solo uno es direccionable.
        expect(writableDayIndex({ origen: 'vivo', idx: 0 })).toBe(0);
        expect(writableDayIndex({ origen: 'archivado', idx: 0 })).toBeNull();
    });
});
