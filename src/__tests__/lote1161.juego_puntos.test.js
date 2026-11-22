/**
 * [P1-PLAN-LOTE-1161 · 2026-11-22] El espejo JS del juego por puntos da EXACTAMENTE lo mismo que el servidor
 * (`backend/juego_puntos.py`): mismos casos compartidos y mismas constantes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    DIAMANTE_PASO, ESCUDOS_MAX, ESCUDO_CADA, ESTRELLAS_SEMANA, PUNTOS, RANGOS_PUNTOS, TRAMOS_RACHA,
    estrellasPorPuntos, logrosDelDia, puntosBase, puntosDeHoy, rangoPorPuntos, recorrer, redondear, tramoDeRacha,
} from '../utils/juegoPuntos';

const BACK = resolve(process.cwd(), '../backend');
const casos = JSON.parse(readFileSync(resolve(BACK, 'tests/fixtures/juego_puntos_casos.json'), 'utf8'));
const py = readFileSync(resolve(BACK, 'juego_puntos.py'), 'utf8');

describe('[1161] paridad con el servidor', () => {
    it('casos compartidos: recorrer', () => {
        for (const c of casos.recorrer) {
            const r = recorrer(c.dias, c.hoy);
            for (const [k, v] of Object.entries(c.espera)) expect([c.nombre, k, r[k]]).toEqual([c.nombre, k, v]);
        }
    });
    it('casos compartidos: rango y base', () => {
        for (const c of casos.rango) {
            const r = rangoPorPuntos(c.puntos);
            expect([c.puntos, r.clave, r.division, r.puntos_para_la_siguiente]).toEqual([c.puntos, c.clave, c.division, c.faltan]);
        }
        for (const c of casos.base) expect(puntosBase(c.logros)).toBe(c.puntos);
    });
    it('constantes iguales que juego_puntos.py', () => {
        const pyPuntos = Object.fromEntries([...py.match(/^PUNTOS = \{(.*)\}$/m)[1].matchAll(/"(\w+)": (\d+)/g)].map((m) => [m[1], Number(m[2])]));
        expect(pyPuntos).toEqual(PUNTOS);
        expect(py.match(/^ESTRELLAS_SEMANA = \(([\d, ]+)\)/m)[1].split(',').map(Number)).toEqual(ESTRELLAS_SEMANA);
        const rangos = [...py.match(/^RANGOS_PUNTOS = \((.*)\)$/m)[1].matchAll(/\("(\w+)", (\d+)\)/g)].map((m) => [m[1], Number(m[2])]);
        expect(rangos).toEqual(RANGOS_PUNTOS);
        expect(Number(py.match(/^ESCUDO_CADA = (\d+)/m)[1])).toBe(ESCUDO_CADA);
        expect(Number(py.match(/^ESCUDOS_MAX = (\d+)/m)[1])).toBe(ESCUDOS_MAX);
        expect(Number(py.match(/^DIAMANTE_PASO = (\d+)/m)[1])).toBe(DIAMANTE_PASO);
        const bloque = py.match(/^TRAMOS_RACHA = \(([\s\S]*?)\)\n/m)[1];
        const tramos = [...bloque.matchAll(/\((\d+), ([\d.]+), (?:"(\w+)"|None)\)/g)].map((m) => [Number(m[1]), Number(m[2]), m[3] || null]);
        expect(tramos).toEqual(TRAMOS_RACHA);
    });
});

describe('[1161] puntos de hoy', () => {
    const base = { calories: 1900, protein: 110, mealsCount: 3, metaKcal: 2000, metaProteina: 120, objetivo: 'maintenance' };
    it('sin meta de proteína no puntúa; agua apagada = null', () => {
        const lg = logrosDelDia({ ...base, metaProteina: null });
        expect(lg.proteina).toBe(false);
        expect(lg.agua).toBeNull();
        expect(puntosBase(lg)).toBe(30);
    });
    it('máximo 45 con agua', () => {
        expect(puntosBase(logrosDelDia({ ...base, protein: 120, vasos: 8, metaVasos: 8 }))).toBe(45);
    });
    it('la racha hasta ayer multiplica hoy', () => {
        const lg = logrosDelDia({ ...base, protein: 120 });
        expect(puntosDeHoy({ logros: lg, rachaHastaAyer: 6 })).toEqual({ puntos: 60, base: 40, mult: 1.5, rachaConHoy: 7 });
        expect(tramoDeRacha(9)).toEqual({ mult: 1.5, clave: 'en_llamas', siguienteEn: 14, siguienteMult: 1.75 });
    });
    it('redondeo de mitades y estrellas por puntos', () => {
        expect(redondear(22.5)).toBe(23);
        expect([79, 80, 160, 260].map(estrellasPorPuntos)).toEqual([0, 1, 2, 3]);
    });
});
