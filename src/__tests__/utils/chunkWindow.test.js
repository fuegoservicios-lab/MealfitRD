// [P-RECIPES-CHUNK-WINDOW] Tests del helper chunk-aware usado por Recipes.jsx.
//
// Paridad cross-language: los expected outputs de `splitWithAbsorb` deben
// coincidir EXACTAMENTE con los del docstring de `backend/constants.py:961`.
// Si el backend cambia su algoritmo, este test falla y guía al fix sincrónico.

import { describe, it, expect } from 'vitest';
import {
    parseStartLocal,
    splitWithAbsorb,
    findChunkContaining,
} from '../../utils/chunkWindow';

describe('splitWithAbsorb — paridad con backend/constants.py:961', () => {
    // Casos canónicos del docstring del backend. Si el backend cambia el
    // algoritmo, actualizar AMBOS lados al mismo tiempo.
    it('7d → [3, 4] (caso especial)', () => {
        expect(splitWithAbsorb(7)).toEqual([3, 4]);
    });

    it('9d → [3, 3, 3] (n_full < umbral, lógica original)', () => {
        expect(splitWithAbsorb(9)).toEqual([3, 3, 3]);
    });

    it('14d → [3, 3, 4, 4] (rem!=0, lógica original)', () => {
        expect(splitWithAbsorb(14)).toEqual([3, 3, 4, 4]);
    });

    it('15d → [3, 4, 4, 4] (P1-A: prefiere chunks de 4)', () => {
        expect(splitWithAbsorb(15)).toEqual([3, 4, 4, 4]);
    });

    it('18d → [3, 4, 4, 4, 3] (P1-A)', () => {
        expect(splitWithAbsorb(18)).toEqual([3, 4, 4, 4, 3]);
    });

    it('21d → [3, 4, 4, 4, 6] (P1-A: leftover absorbido)', () => {
        expect(splitWithAbsorb(21)).toEqual([3, 4, 4, 4, 6]);
    });

    it('30d → [3, 4, 4, 4, 4, 4, 4, 3] (P1-A)', () => {
        expect(splitWithAbsorb(30)).toEqual([3, 4, 4, 4, 4, 4, 4, 3]);
    });

    it('invariante: sum(result) === totalDays para todos los casos', () => {
        for (const total of [3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 18, 21, 25, 30]) {
            const sum = splitWithAbsorb(total).reduce((a, b) => a + b, 0);
            expect(sum).toBe(total);
        }
    });

    it('plans cortos: <= base+1 cae a un solo chunk', () => {
        expect(splitWithAbsorb(3)).toEqual([3]);
        expect(splitWithAbsorb(4)).toEqual([4]);
    });
});


describe('findChunkContaining', () => {
    it('7d plan, dayIndex=0 (día 1) → primer chunk de 3', () => {
        expect(findChunkContaining(7, 0)).toEqual({ start: 0, size: 3 });
    });

    it('7d plan, dayIndex=2 (día 3, último del chunk 0) → primer chunk', () => {
        expect(findChunkContaining(7, 2)).toEqual({ start: 0, size: 3 });
    });

    it('7d plan, dayIndex=3 (día 4, primero del chunk 1) → segundo chunk de 4', () => {
        expect(findChunkContaining(7, 3)).toEqual({ start: 3, size: 4 });
    });

    it('7d plan, dayIndex=6 (día 7, último) → segundo chunk de 4', () => {
        expect(findChunkContaining(7, 6)).toEqual({ start: 3, size: 4 });
    });

    it('15d plan (P1-A: [3,4,4,4]), dayIndex=5 → chunk con start=3 size=4', () => {
        expect(findChunkContaining(15, 5)).toEqual({ start: 3, size: 4 });
    });

    it('15d plan, dayIndex=14 (último) → último chunk con start=11 size=4', () => {
        expect(findChunkContaining(15, 14)).toEqual({ start: 11, size: 4 });
    });

    it('dayIndex fuera de rango (defensivo) → último chunk', () => {
        // 7d plan: chunks [3, 4]. dayIndex=99 → último chunk (start=3, size=4).
        expect(findChunkContaining(7, 99)).toEqual({ start: 3, size: 4 });
    });

    it('totalDays=0 → {start: 0, size: 0}', () => {
        expect(findChunkContaining(0, 0)).toEqual({ start: 0, size: 0 });
    });

    it('plan de 3 días: chunk único cubre todo', () => {
        expect(findChunkContaining(3, 0)).toEqual({ start: 0, size: 3 });
        expect(findChunkContaining(3, 2)).toEqual({ start: 0, size: 3 });
    });
});


describe('parseStartLocal', () => {
    it('null → midnight de hoy local', () => {
        const result = parseStartLocal(null);
        const expected = new Date();
        expected.setHours(0, 0, 0, 0);
        expect(result.getTime()).toBe(expected.getTime());
    });

    it('YYYY-MM-DD parseado como LOCAL midnight (no UTC)', () => {
        const result = parseStartLocal('2026-05-08');
        // local Date(2026, 4, 8): mes 0-indexed → mayo 8.
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(4); // mayo
        expect(result.getDate()).toBe(8);
        expect(result.getHours()).toBe(0);
    });

    it('ISO timestamp normaliza a midnight LOCAL', () => {
        // Independiente de TZ del runner: el resultado siempre tiene 00:00:00 local.
        const result = parseStartLocal('2026-05-08T15:30:00Z');
        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
        expect(result.getSeconds()).toBe(0);
    });

    it('cadena vacía → midnight de hoy (fallback defensivo)', () => {
        const result = parseStartLocal('');
        const expected = new Date();
        expected.setHours(0, 0, 0, 0);
        expect(result.getTime()).toBe(expected.getTime());
    });
});


describe('integración: 7d plan típico (caso de la screenshot)', () => {
    // Reproduce el escenario del usuario: plan de 7 días iniciado HOY.
    // Selector debe mostrar 3 días (chunk 0) cuando today=día 1, y 4 días
    // (chunk 1) cuando today=día 4.

    it('día 1: muestra solo chunk de 3 días', () => {
        const { start, size } = findChunkContaining(7, 0);
        expect(size).toBe(3);
        expect(start).toBe(0);
    });

    it('día 4: muestra chunk de 4 días', () => {
        const { start, size } = findChunkContaining(7, 3);
        expect(size).toBe(4);
        expect(start).toBe(3);
    });

    it('día 7 (último): sigue mostrando 4 días del chunk final', () => {
        const { start, size } = findChunkContaining(7, 6);
        expect(size).toBe(4);
        expect(start).toBe(3);
    });
});
