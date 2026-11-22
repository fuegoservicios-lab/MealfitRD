/**
 * [P1-PLAN-LOTE-1161 · 2026-11-22] El espejo JS del juego por puntos da EXACTAMENTE lo mismo que el servidor
 * (`backend/juego_puntos.py`): mismos casos compartidos y mismas constantes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    BONO_SEMANA_PERFECTA, DIVISIONES, MAESTRO_PUNTOS, MAESTRO_RACHA, MAESTRO_SEMANAS_PERFECTAS, maestroProgreso,
    rangoDelJugador,
    CALORIAS_AYUNO_FRACCION, COMIDAS_AYUNO_COMPLETO, COMIDAS_DIA_COMPLETO, DIAMANTE_PASO, ESCUDOS_MAX, ESCUDO_CADA,
    ESTRELLAS_SEMANA, HITOS_RACHA_LARGOS, PROTEINA_FRACCION, PROTEINA_PARCIAL_FRACCION, PUNTOS,
    PUNTOS_PROTEINA_PARCIAL, RANGOS_PUNTOS, TRAMOS_RACHA, diasParaEscudo, estrellasPorPuntos, gananciaLogro,
    logrosDelDia, maximoDiario, nivelIndice, proximoHitoRacha, puntosBase, puntosDeHoy, rangoConPiso, rangoPorPuntos,
    recorrer, redondear, tramoDeRacha,
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
            expect([c.puntos, r.clave, r.division, r.romano, r.puntos_para_la_siguiente])
                .toEqual([c.puntos, c.clave, c.division, c.romano, c.faltan]);
        }
        // [1163] rango del jugador con Maestro (los tres requisitos) y piso
        for (const c of casos.jugador) {
            const r = rangoDelJugador(c.puntos, c.semanas_perfectas, c.mejor_racha, c.piso);
            const m = maestroProgreso(c.puntos, c.semanas_perfectas, c.mejor_racha);
            expect([c.puntos, r.clave, r.division, r.romano, r.siguiente?.clave ?? null, r.puntos_para_la_siguiente, m.cumplidos])
                .toEqual([c.puntos, c.clave, c.division, c.romano, c.siguiente, c.faltan, c.cumplidos]);
        }
        for (const c of casos.base) expect(puntosBase(c.logros)).toBe(c.puntos);
    });
    it('constantes iguales que juego_puntos.py', () => {
        const pyPuntos = Object.fromEntries([...py.match(/^PUNTOS = \{(.*)\}$/m)[1].matchAll(/"(\w+)": (\d+)/g)].map((m) => [m[1], Number(m[2])]));
        expect(pyPuntos).toEqual(PUNTOS);
        expect(Number(py.match(/^PUNTOS_PROTEINA_PARCIAL = (\d+)/m)[1])).toBe(PUNTOS_PROTEINA_PARCIAL);
        expect(Number(py.match(/^COMIDAS_DIA_COMPLETO = (\d+)/m)[1])).toBe(COMIDAS_DIA_COMPLETO);
        expect(Number(py.match(/^COMIDAS_AYUNO_COMPLETO = (\d+)/m)[1])).toBe(COMIDAS_AYUNO_COMPLETO);
        expect(Number(py.match(/^CALORIAS_AYUNO_FRACCION = ([\d.]+)/m)[1])).toBe(CALORIAS_AYUNO_FRACCION);
        expect(Number(py.match(/^PROTEINA_PARCIAL_FRACCION = ([\d.]+)/m)[1])).toBe(PROTEINA_PARCIAL_FRACCION);
        expect(Number(py.match(/^PROTEINA_FRACCION = ([\d.]+)/m)[1])).toBe(PROTEINA_FRACCION);
        expect(py.match(/^ESTRELLAS_SEMANA = \(([\d, ]+)\)/m)[1].split(',').map(Number)).toEqual(ESTRELLAS_SEMANA);
        const rangos = [...py.match(/^RANGOS_PUNTOS = \((.*)\)$/m)[1].matchAll(/\("(\w+)", (\d+)\)/g)].map((m) => [m[1], Number(m[2])]);
        expect(rangos).toEqual(RANGOS_PUNTOS);
        expect(Number(py.match(/^ESCUDO_CADA = (\d+)/m)[1])).toBe(ESCUDO_CADA);
        expect(Number(py.match(/^ESCUDOS_MAX = (\d+)/m)[1])).toBe(ESCUDOS_MAX);
        expect(Number(py.match(/^DIAMANTE_PASO = (\d+)/m)[1])).toBe(DIAMANTE_PASO);
        expect(Number(py.match(/^DIVISIONES = (\d+)/m)[1])).toBe(DIVISIONES);
        expect(Number(py.match(/^BONO_SEMANA_PERFECTA = (\d+)/m)[1])).toBe(BONO_SEMANA_PERFECTA);
        expect(Number(py.match(/^MAESTRO_SEMANAS_PERFECTAS = (\d+)/m)[1])).toBe(MAESTRO_SEMANAS_PERFECTAS);
        expect(Number(py.match(/^MAESTRO_RACHA = (\d+)/m)[1])).toBe(MAESTRO_RACHA);
        expect(MAESTRO_PUNTOS).toBe(RANGOS_PUNTOS[RANGOS_PUNTOS.length - 1][1] + DIAMANTE_PASO * DIVISIONES);
        expect(py.match(/^HITOS_RACHA_LARGOS = \(([\d, ]+)\)/m)[1].split(',').map(Number)).toEqual(HITOS_RACHA_LARGOS);
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
        expect(lg.proteina_parcial).toBe(false);
        expect(lg.agua).toBeNull();
        expect(puntosBase(lg)).toBe(30);
    });
    it('ayuno intermitente (2 comidas ≥70% kcal) y proteína parcial (70% = +5)', () => {
        const lg = logrosDelDia({ calories: 1600, protein: 90, mealsCount: 2, metaKcal: 2000, metaProteina: 120, objetivo: 'maintenance' });
        expect(lg.completo).toBe(true);
        expect(lg.proteina).toBe(false);
        expect(lg.proteina_parcial).toBe(true);
        expect(puntosBase(lg)).toBe(20);
        expect(gananciaLogro({ logros: lg, clave: 'proteina', mult: 1.6 })).toBe(8);
    });
    it('máximo 45 con agua y techo diario multiplicado', () => {
        expect(puntosBase(logrosDelDia({ ...base, protein: 120, vasos: 8, metaVasos: 8 }))).toBe(45);
        expect(maximoDiario({ mult: 1.6, conAgua: false })).toBe(64);
        expect(maximoDiario({ mult: 1.6, conAgua: true })).toBe(72);
    });
    it('la racha hasta ayer multiplica hoy', () => {
        const lg = logrosDelDia({ ...base, protein: 120 });
        expect(puntosDeHoy({ logros: lg, rachaHastaAyer: 6 })).toEqual({ puntos: 52, base: 40, mult: 1.3, rachaConHoy: 7 });
        expect(tramoDeRacha(9)).toEqual({ mult: 1.3, clave: 'en_llamas', siguienteEn: 14, siguienteMult: 1.45 });
        expect(proximoHitoRacha(33)).toBe(50);
        expect(diasParaEscudo(9, 1)).toBe(5);
        expect(diasParaEscudo(9, 2)).toBeNull();
    });
    it('rango con piso nunca baja aunque bajen los puntos del día', () => {
        const piso = nivelIndice('plata', 4);
        const r = rangoConPiso(1100, piso);
        expect(r.clave).toBe('plata');
        expect(r.division).toBe(4);
        expect(r.romano).toBe('I');
        expect(r.avance).toBe(0);
    });
    it('redondeo de mitades y estrellas por puntos', () => {
        expect(redondear(22.5)).toBe(23);
        expect([84, 85, 170, 265].map(estrellasPorPuntos)).toEqual([0, 1, 2, 3]);
    });
});
