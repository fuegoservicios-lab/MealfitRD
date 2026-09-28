// [P1-PLAN-LOTE-691 · 2026-09-28] «Escanear mi plato» y «Anotar comida» ya no desaparecen a media tarde.
// El chat del día nace con los avisos del coach (desayuno, almuerzo, merienda, cena): con la regla de ≤4 mensajes, a la
// hora de la cena ya no había atajos. El dueño: «las preguntas predeterminadas que aparecían antes ya no están».
import { describe, it, expect } from 'vitest';
import { atajosDelChat } from '../utils/atajosDelChat';

const t = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k]) : s);

describe('[691] atajos del chat', () => {
    it('con el hilo largo quedan las dos acciones (sin preguntas del momento)', () => {
        const a = atajosDelChat({ hora: 20, modoContador: false, comidas: [], soloAcciones: true, t });
        expect(a.map((x) => x.id)).toEqual(['escanear', 'anotar']);
        expect(a.every((x) => x.tipo === 'accion')).toBe(true);
    });
    it('con el hilo corto, lo de siempre (acciones + la pregunta del momento)', () => {
        const a = atajosDelChat({ hora: 20, modoContador: false, comidas: [], t });
        expect(a.slice(0, 2).map((x) => x.id)).toEqual(['escanear', 'anotar']);
        expect(a.some((x) => x.tipo === 'mensaje')).toBe(true);
    });
});
