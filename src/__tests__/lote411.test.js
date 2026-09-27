// [P1-PLAN-LOTE-411 · 2026-09-27] Los atajos del chat dicen algo del MOMENTO y de TU día.
//
// El dueño (captura a la 1:47 de la madrugada: «¿Qué me falta hoy?» · «Registrar lo que comí» · «Proponme una
// comida»): «¿estos textos son útiles? reemplázalos por mejores». Eran tres frases fijas, iguales a mediodía y de
// madrugada; «Registrar lo que comí» mandaba un mensaje (gastaba uno del mes) para que el coach preguntara «¿qué
// comiste?». Ahora:
//   · dos ACCIONES que no gastan mensajes: «📷 Escanear mi plato» y «Anotar comida» abren sus hojas;
//   · la pregunta del momento con TUS números (me faltan 41 g de proteína, voy alto en grasa, de madrugada algo
//     ligero, sin desayuno por la mañana…);
//   · y la de tu modo (plan: «¿Qué me toca ahora?»; contador: «¿Cómo voy hoy?»).
import { describe, it, expect } from 'vitest';
import { atajosDelChat } from '../utils/atajosDelChat';

const t = (s, v = {}) => Object.entries(v).reduce((a, [k, x]) => a.replace(`{${k}}`, x), s);
const metas = { calories: 2050, protein: 134, carbs: 251, fats: 57 };
const textos = (a) => a.map((x) => x.texto);

describe('[411] atajos del chat', () => {
    it('siempre empiezan con las dos acciones que no gastan mensajes', () => {
        const a = atajosDelChat({ hora: 13, modoContador: true, t });
        expect(a.slice(0, 2)).toEqual([
            { id: 'escanear', tipo: 'accion', accion: 'escanear', texto: '📷 Escanear mi plato' },
            { id: 'anotar', tipo: 'accion', accion: 'anotar', texto: 'Anotar comida' },
        ]);
        expect(a.every((x) => x.tipo === 'accion' || typeof x.mensaje === 'string')).toBe(true);
    });

    it('de madrugada: algo ligero', () => {
        expect(textos(atajosDelChat({ hora: 1, modoContador: true, t }))).toContain('Tengo hambre: algo ligero');
    });

    it('por la tarde con proteína corta: la cifra real', () => {
        const a = atajosDelChat({ hora: 17, modoContador: true, t, metas, totales: { calories: 1200, protein: 93, carbs: 140, fats: 40 } });
        expect(textos(a)).toContain('Me faltan 41 g de proteína: ¿qué como?');
    });

    it('pasado de grasa: lo dice (y de noche habla de cenar)', () => {
        const a = atajosDelChat({ hora: 20, modoContador: true, t, metas, totales: { calories: 1500, protein: 120, carbs: 105, fats: 75 } });
        expect(textos(a)).toContain('Voy alto en grasa: ¿qué ceno?');
    });

    it('por la mañana sin desayuno registrado', () => {
        const a = atajosDelChat({ hora: 8, modoContador: true, t, metas, totales: { calories: 0, protein: 0, carbs: 0, fats: 0 }, comidas: [] });
        expect(textos(a)).toContain('Ideas de desayuno con proteína');
    });

    it('el atajo del modo: plan o contador; sin números no inventa cifras', () => {
        expect(textos(atajosDelChat({ hora: 13, modoContador: false, t }))).toContain('¿Qué me toca ahora?');
        const c = textos(atajosDelChat({ hora: 13, modoContador: true, t }));
        expect(c).toContain('¿Cómo voy hoy?');
        expect(c.some((x) => /\d+ g/.test(x))).toBe(false);
    });

    it('cuatro como máximo y sin repetidos', () => {
        const a = atajosDelChat({ hora: 17, modoContador: false, t, metas, totales: { calories: 1200, protein: 60, carbs: 100, fats: 80 } });
        expect(a.length).toBeLessThanOrEqual(4);
        expect(new Set(textos(a)).size).toBe(a.length);
    });
});
