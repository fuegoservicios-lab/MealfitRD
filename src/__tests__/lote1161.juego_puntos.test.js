/**
 * [P1-PLAN-LOTE-1161 · 2026-11-22] El espejo JS del juego por puntos da EXACTAMENTE lo mismo que el servidor
 * (`backend/juego_puntos.py`): mismos casos compartidos y mismas constantes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    BONO_SEMANA_PERFECTA, CALORIAS_AYUNO_FRACCION, CALORIAS_CERCA_FRACCION, CALORIAS_MIN_MULT_FRACCION,
    CARBOS_LOWCARB_UMBRAL, CARBOS_MIN_FRACCION, CARBOS_TOPE_FRACCION, COMIDAS_AYUNO_COMPLETO,
    COMIDAS_DIA_COMPLETO, DIVISIONES, ESCUDOS_MAX, ESCUDO_CADA, ESTRELLAS_SEMANA, FIBRA_MIN_PERFECTO_FRACCION,
    GRASAS_TOPE_FRACCION, HITOS_RACHA_LARGOS, MAESTRO_PUNTOS, MAESTRO_RACHA, MAESTRO_SEMANAS_PERFECTAS,
    MICROS_AZUCAR_SEVERO_FRACCION, MICROS_AZUCAR_TOPE_FRACCION, MICROS_CLAVE, MICROS_META_FRACCION,
    MICROS_MIN_EVALUADOS, MICROS_PARCIAL_FRACCION, MICROS_PISO_FRACCION, MICROS_POTASIO_SEVERO_FRACCION,
    MICROS_SATFAT_SEVERO_FRACCION, MICROS_SATFAT_TOPE_FRACCION, MICROS_SODIO_SEVERO_FRACCION,
    MICROS_SODIO_TOPE_FRACCION, PROTEINA_FRACCION, PROTEINA_PARCIAL_FRACCION,
    PUNTOS, PUNTOS_CALORIAS_CERCA, PUNTOS_CALORIAS_PASADO, PUNTOS_DIA_PERFECTO, PUNTOS_MICROS_PARCIAL,
    PUNTOS_PROTEINA_PARCIAL, RANGOS_PUNTOS, TRAMOS_RACHA, UMBRALES_DIVISIONES,
    aplicaMultiplicador, diasParaEscudo, estrellasPorPuntos, gananciaLogro,
    logrosDelDia, maestroProgreso, maximoDiario, nivelIndice, proximoHitoRacha, puntosBase,
    puntosCaloriasParciales, puntosDeHoy, puntosMicrosParciales, rangoConPiso, rangoDelJugador, rangoPorPuntos, recorrer, redondear,
    tramoDeRacha,
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
        expect(Number(py.match(/^PUNTOS_CALORIAS_CERCA = (\d+)/m)[1])).toBe(PUNTOS_CALORIAS_CERCA);
        expect(Number(py.match(/^PUNTOS_CALORIAS_PASADO = (\d+)/m)[1])).toBe(PUNTOS_CALORIAS_PASADO);
        expect(Number(py.match(/^PUNTOS_MICROS_PARCIAL = (\d+)/m)[1])).toBe(PUNTOS_MICROS_PARCIAL);
        expect(Number(py.match(/^PUNTOS_DIA_PERFECTO = (\d+)/m)[1])).toBe(PUNTOS_DIA_PERFECTO);
        expect(Number(py.match(/^CALORIAS_CERCA_FRACCION = ([\d.]+)/m)[1])).toBe(CALORIAS_CERCA_FRACCION);
        expect(Number(py.match(/^COMIDAS_DIA_COMPLETO = (\d+)/m)[1])).toBe(COMIDAS_DIA_COMPLETO);
        expect(Number(py.match(/^COMIDAS_AYUNO_COMPLETO = (\d+)/m)[1])).toBe(COMIDAS_AYUNO_COMPLETO);
        expect(Number(py.match(/^CALORIAS_AYUNO_FRACCION = ([\d.]+)/m)[1])).toBe(CALORIAS_AYUNO_FRACCION);
        expect(Number(py.match(/^PROTEINA_PARCIAL_FRACCION = ([\d.]+)/m)[1])).toBe(PROTEINA_PARCIAL_FRACCION);
        expect(Number(py.match(/^PROTEINA_FRACCION = ([\d.]+)/m)[1])).toBe(PROTEINA_FRACCION);
        expect(Number(py.match(/^CARBOS_MIN_FRACCION = ([\d.]+)/m)[1])).toBe(CARBOS_MIN_FRACCION);
        expect(Number(py.match(/^CARBOS_LOWCARB_UMBRAL = ([\d.]+)/m)[1])).toBe(CARBOS_LOWCARB_UMBRAL);
        expect(Number(py.match(/^CARBOS_TOPE_FRACCION = ([\d.]+)/m)[1])).toBe(CARBOS_TOPE_FRACCION);
        expect(Number(py.match(/^GRASAS_TOPE_FRACCION = ([\d.]+)/m)[1])).toBe(GRASAS_TOPE_FRACCION);
        expect([...py.match(/^MICROS_CLAVE = \((.*)\)$/m)[1].matchAll(/"(\w+)"/g)].map((m) => m[1])).toEqual(MICROS_CLAVE);
        expect(Number(py.match(/^MICROS_PISO_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_PISO_FRACCION);
        expect(Number(py.match(/^MICROS_SODIO_TOPE_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_SODIO_TOPE_FRACCION);
        expect(Number(py.match(/^MICROS_SODIO_SEVERO_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_SODIO_SEVERO_FRACCION);
        expect(Number(py.match(/^MICROS_POTASIO_SEVERO_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_POTASIO_SEVERO_FRACCION);
        expect(Number(py.match(/^MICROS_SATFAT_TOPE_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_SATFAT_TOPE_FRACCION);
        expect(Number(py.match(/^MICROS_SATFAT_SEVERO_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_SATFAT_SEVERO_FRACCION);
        expect(Number(py.match(/^MICROS_AZUCAR_TOPE_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_AZUCAR_TOPE_FRACCION);
        expect(Number(py.match(/^MICROS_AZUCAR_SEVERO_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_AZUCAR_SEVERO_FRACCION);
        expect(Number(py.match(/^FIBRA_MIN_PERFECTO_FRACCION = ([\d.]+)/m)[1])).toBe(FIBRA_MIN_PERFECTO_FRACCION);
        expect(Number(py.match(/^CALORIAS_MIN_MULT_FRACCION = ([\d.]+)/m)[1])).toBe(CALORIAS_MIN_MULT_FRACCION);
        expect(Number(py.match(/^MICROS_MIN_EVALUADOS = (\d+)/m)[1])).toBe(MICROS_MIN_EVALUADOS);
        expect(Number(py.match(/^MICROS_META_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_META_FRACCION);
        expect(Number(py.match(/^MICROS_PARCIAL_FRACCION = ([\d.]+)/m)[1])).toBe(MICROS_PARCIAL_FRACCION);
        expect(py.match(/^ESTRELLAS_SEMANA = \(([\d, ]+)\)/m)[1].split(',').map(Number)).toEqual(ESTRELLAS_SEMANA);
        const rangos = [...py.match(/^RANGOS_PUNTOS = \((.*)\)$/m)[1].matchAll(/\("(\w+)", (\d+)\)/g)].map((m) => [m[1], Number(m[2])]);
        expect(rangos).toEqual(RANGOS_PUNTOS);
        const umbBloque = py.match(/^UMBRALES_DIVISIONES = \(([\s\S]*?)\)\n/m)[1];
        const umb = [...umbBloque.matchAll(/\("(\w+)", \(([\d, ]+)\)\)/g)].map((m) => [m[1], m[2].split(',').map(Number)]);
        expect(umb).toEqual(UMBRALES_DIVISIONES);
        expect(Number(py.match(/^ESCUDO_CADA = (\d+)/m)[1])).toBe(ESCUDO_CADA);
        expect(Number(py.match(/^ESCUDOS_MAX = (\d+)/m)[1])).toBe(ESCUDOS_MAX);
        expect(Number(py.match(/^DIVISIONES = (\d+)/m)[1])).toBe(DIVISIONES);
        expect(Number(py.match(/^BONO_SEMANA_PERFECTA = (\d+)/m)[1])).toBe(BONO_SEMANA_PERFECTA);
        expect(Number(py.match(/^MAESTRO_SEMANAS_PERFECTAS = (\d+)/m)[1])).toBe(MAESTRO_SEMANAS_PERFECTAS);
        expect(Number(py.match(/^MAESTRO_RACHA = (\d+)/m)[1])).toBe(MAESTRO_RACHA);
        expect(Number(py.match(/^MAESTRO_PUNTOS = (\d+)/m)[1])).toBe(MAESTRO_PUNTOS);
        expect(py.match(/^HITOS_RACHA_LARGOS = \(([\d, ]+)\)/m)[1].split(',').map(Number)).toEqual(HITOS_RACHA_LARGOS);
        const bloque = py.match(/^TRAMOS_RACHA = \(([\s\S]*?)\)\n/m)[1];
        const tramos = [...bloque.matchAll(/\((\d+), ([\d.]+), (?:"(\w+)"|None)\)/g)].map((m) => [Number(m[1]), Number(m[2]), m[3] || null]);
        expect(tramos).toEqual(TRAMOS_RACHA);
    });
});

describe('[1161] puntos de hoy', () => {
    const metaMicros = Object.fromEntries(MICROS_CLAVE.map((k) => [k, { target: 100, kind: k === 'sodium_mg' ? 'ceiling' : 'floor' }]));
    const valsMicros = Object.fromEntries(MICROS_CLAVE.map((k) => [k, 95]));
    const base = {
        calories: 1900, protein: 110, carbs: 200, fats: 60, mealsCount: 3,
        metaKcal: 2000, metaProteina: 120, metaCarbos: 220, metaGrasas: 70,
        micros: valsMicros, metaMicros, objetivo: 'maintenance',
    };
    it('sin meta de proteína no puntúa; agua apagada = null', () => {
        const lg = logrosDelDia({ ...base, metaProteina: null, metaCarbos: null, metaGrasas: null, metaMicros: null });
        expect(lg.proteina).toBe(false);
        expect(lg.proteina_parcial).toBe(false);
        expect(lg.carbos).toBeNull();
        expect(lg.grasas).toBeNull();
        expect(lg.micros).toBeNull();
        expect(lg.agua).toBeNull();
        expect(lg.dia_perfecto).toBe(false);
        expect(puntosBase(lg)).toBe(14);
    });
    it('ayuno intermitente (2 comidas ≥70% kcal), calorías cerca/pasado y proteína parcial', () => {
        const lg = logrosDelDia({ calories: 1600, protein: 90, mealsCount: 2, metaKcal: 2000, metaProteina: 120, objetivo: 'maintenance' });
        expect(lg.completo).toBe(true);
        expect(lg.calorias_cerca).toBe(true);
        expect(lg.proteina).toBe(false);
        expect(lg.proteina_parcial).toBe(true);
        expect(puntosBase(lg)).toBe(11);
        expect(gananciaLogro({ logros: lg, clave: 'proteina', mult: 1.6 })).toBe(9);
        expect(puntosCaloriasParciales({ logros: lg, mult: 1.6 })).toBe(5);
        const pasado = logrosDelDia({ calories: 2800, protein: 20, mealsCount: 1, metaKcal: 2000, metaProteina: 120, objetivo: 'maintenance' });
        expect(pasado.calorias_pasado).toBe(true);
        expect(puntosBase(pasado)).toBe(0);
        expect(puntosCaloriasParciales({ logros: pasado, mult: 1.6 })).toBe(0);
    });
    it('grasas y carbos piden día completo; exceso pausa multiplicador; micros parciales y cobertura honesta', () => {
        const valsBajos = Object.fromEntries(MICROS_CLAVE.map((k) => [k, 15]));
        const incompleto = logrosDelDia({ ...base, calories: 400, protein: 20, carbs: 20, fats: 10, mealsCount: 1, micros: valsBajos });
        expect(incompleto.completo).toBe(false);
        expect(incompleto.grasas).toBe(false);
        expect(incompleto.carbos).toBe(false);
        expect(incompleto.micros).toBe(false);
        expect(puntosBase(incompleto)).toBe(0);

        const carbAlto = logrosDelDia({ ...base, protein: 120, carbs: 300, metaMicros: null });
        expect(carbAlto.carbos).toBe(false);
        expect(carbAlto.carbos_pasado).toBe(true);
        expect(carbAlto.dia_perfecto).toBe(false);
        expect(puntosDeHoy({ logros: carbAlto, rachaHastaAyer: 9 })).toEqual({
            puntos: 29, base: 29, mult: 1.3, multActivo: false, multEfectivo: 1, rachaConHoy: 10,
        });

        const keto = logrosDelDia({ ...base, protein: 120, carbs: 10, metaCarbos: 40, metaMicros: null });
        expect(keto.carbos).toBe(true);

        const parcialMicros = logrosDelDia({
            ...base, protein: 120,
            micros: { fiber_g: 80, potassium_mg: 80, calcium_mg: 20, iron_mg: 20, vit_c_mg: 20, sodium_mg: 150 },
        });
        expect(parcialMicros.micros).toBe(false);
        expect(parcialMicros.micros_parcial).toBe(true);
        expect(parcialMicros.sodio_pasado).toBe(true);
        expect(puntosMicrosParciales({ logros: parcialMicros, mult: 1.3 })).toBe(4);
    });
    it('máximo 55 con agua (50 sin) y techo diario multiplicado', () => {
        expect(puntosBase(logrosDelDia({ ...base, protein: 120, vasos: 8, metaVasos: 8 }))).toBe(55);
        expect(maximoDiario({ mult: 1.6, conAgua: false })).toBe(80);
        expect(maximoDiario({ mult: 1.6, conAgua: true })).toBe(88);
    });
    it('la racha hasta ayer multiplica hoy y los logros en 0 enseñan su ganancia real sin duplicar día perfecto', () => {
        const lg = logrosDelDia({ ...base, protein: 120 });
        expect(puntosDeHoy({ logros: lg, rachaHastaAyer: 6 })).toEqual({
            puntos: 65, base: 50, mult: 1.3, multActivo: true, multEfectivo: 1.3, rachaConHoy: 7,
        });
        expect(tramoDeRacha(9)).toEqual({ mult: 1.3, clave: 'en_llamas', siguienteEn: 14, siguienteMult: 1.45 });
        expect(proximoHitoRacha(33)).toBe(50);
        expect(diasParaEscudo(9, 1)).toBe(5);
        expect(diasParaEscudo(9, 2)).toBeNull();
        const vacio = logrosDelDia({
            calories: 0, protein: 0, carbs: 0, fats: 0, mealsCount: 0,
            metaKcal: 2000, metaProteina: 120, metaCarbos: 220, metaGrasas: 70, metaMicros, objetivo: 'maintenance',
        });
        expect(gananciaLogro({ logros: vacio, clave: 'completo', mult: 1.6 })).toBe(3);
        expect(gananciaLogro({ logros: vacio, clave: 'banda', mult: 1.6 })).toBe(19);
        expect(gananciaLogro({ logros: vacio, clave: 'proteina', mult: 1.6 })).toBe(16);
        expect(gananciaLogro({ logros: vacio, clave: 'carbos', mult: 1.6 })).toBe(8);
        expect(gananciaLogro({ logros: vacio, clave: 'grasas', mult: 1.6 })).toBe(8);
        expect(gananciaLogro({ logros: vacio, clave: 'micros', mult: 1.6 })).toBe(10);
        expect(gananciaLogro({ logros: vacio, clave: 'dia_perfecto', mult: 1.6 })).toBe(16);
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
        expect([59, 60, 130, 220].map(estrellasPorPuntos)).toEqual([0, 1, 2, 3]);
    });
    it('guardas de sodio, potasio renal, fibra baja, satfat, azúcar y sub-alimentación coinciden con el servidor', () => {
        const mMeta = { ...metaMicros, sodium_mg: { target: 2000, kind: 'ceiling' }, saturated_fat_g: { target: 20, kind: 'ceiling' }, free_sugars_g: { target: 25, kind: 'ceiling' } };
        const sodMod = logrosDelDia({ ...base, protein: 120, micros: { ...valsMicros, sodium_mg: 2300 }, metaMicros: mMeta });
        expect(sodMod.sodio_pasado).toBe(true);
        expect(sodMod.sodio_muy_pasado).toBe(false);
        expect(sodMod.dia_perfecto).toBe(false);
        expect(aplicaMultiplicador(sodMod)).toBe(true);

        const sodSev = logrosDelDia({ ...base, protein: 120, micros: { ...valsMicros, sodium_mg: 3300 }, metaMicros: mMeta });
        expect(sodSev.sodio_muy_pasado).toBe(true);
        expect(aplicaMultiplicador(sodSev)).toBe(false);

        const kRenal = logrosDelDia({ ...base, protein: 120, micros: { ...valsMicros, sodium_mg: 1200, potassium_mg: 3900 }, metaMicros: { ...mMeta, potassium_mg: { target: 3000, kind: 'ceiling' } } });
        expect(kRenal.potasio_pasado).toBe(true);
        expect(kRenal.potasio_muy_pasado).toBe(true);
        expect(aplicaMultiplicador(kRenal)).toBe(false);

        const fibBaja = logrosDelDia({ ...base, protein: 120, micros: { ...valsMicros, sodium_mg: 1200, fiber_g: 20 }, metaMicros: mMeta });
        expect(fibBaja.fibra_baja).toBe(true);
        expect(fibBaja.dia_perfecto).toBe(false);

        const junk = logrosDelDia({ ...base, protein: 120, micros: { saturated_fat_g: 32, free_sugars_g: 45 }, metaMicros: mMeta });
        expect(junk.satfat_muy_pasado).toBe(true);
        expect(junk.azucar_muy_pasado).toBe(true);
        expect(aplicaMultiplicador(junk)).toBe(false);

        const sub = logrosDelDia({ calories: 900, protein: 120, mealsCount: 2, metaKcal: 2000, metaProteina: 120, objetivo: 'maintenance' });
        expect(sub.calorias_muy_bajo).toBe(true);
        expect(aplicaMultiplicador(sub)).toBe(false);
    });
});
