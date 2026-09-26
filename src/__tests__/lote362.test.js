// [P1-PLAN-LOTE-362 · 2026-09-26] La respuesta de una duda también cambia el INGREDIENTE.
//
// El dueño (capturas): «✓ 4 huevos» y «✓ Arepitas de maíz» arriba… y abajo «Huevo revuelto · 2 unidades» y
// «Panecillo». La respuesta movía las calorías con un ajuste aparte, pero la lista de ingredientes (lo que se ve, lo
// que se guarda y lo que se descuenta de la Nevera) no se enteraba. Ahora:
//   · una respuesta con NÚMERO («4 huevos») pone esa cantidad en el ingrediente de la duda; con desglose, las macros
//     salen del ingrediente y el ajuste NO se suma (sería contar dos veces);
//   · una respuesta SIN número («Arepitas de maíz») renombra el ingrediente; las macros siguen por el ajuste;
//   · volver a la opción supuesta devuelve el ingrediente a como estaba.
import { describe, it, expect } from 'vitest';
import { platoDesdeAnalisis, conRespuesta, conRespuestaEscrita, macrosDelPlato, ingredientesParaGuardar, numeroDeRespuesta } from '../components/dashboard/scanMealDishes';

const aj = (calories, protein = 0, carbs = 0, healthy_fats = 0) => ({ calories, protein, carbs, healthy_fats });
const mac = (kcal) => ({ calories: kcal, protein: 0, carbs: 0, healthy_fats: 0 });
const ANALISIS = {
    meal_name: 'Tortilla con panecillo y queso',
    macros: mac(490),
    items: [
        { name: 'Huevo revuelto', quantity: 2, unit: 'unidad', macros: mac(190) },
        { name: 'Panecillo', quantity: 2, unit: 'unidad', macros: mac(150) },
        { name: 'Queso', quantity: 2, unit: 'lasca', macros: mac(150) },
    ],
    dudas: [
        { sobre: 'Huevo revuelto', pregunta: '¿De cuántos huevos?', opciones: [
            { texto: '2 huevos', supuesta: true, ajuste: aj(0) },
            { texto: '3 huevos', supuesta: false, ajuste: aj(95) },
        ] },
        { sobre: 'Panecillo', pregunta: '¿Qué base es?', opciones: [
            { texto: 'Panecillo', supuesta: true, ajuste: aj(0) },
            { texto: 'Arepitas de maíz', supuesta: false, ajuste: aj(40) },
        ] },
    ],
};
const comp = (p, k) => p.componentes.find((c) => c.key === k);

describe('[362] la respuesta toca el ingrediente', () => {
    it('«3 huevos» pone 3 en el huevo y el total sale de los ingredientes (sin sumar el ajuste)', () => {
        const p = conRespuesta(platoDesdeAnalisis(ANALISIS), 0, 1);
        expect(comp(p, '0').qty).toBe(3);
        expect(macrosDelPlato(p).calories).toBe(585);          // 190×3/2 + 150 + 150 — no 490 + 95 + 95
    });

    it('lo ESCRITO en «Otra…» también: «4 huevos» → 4 en el huevo', () => {
        const p = conRespuestaEscrita(platoDesdeAnalisis(ANALISIS), 0, '4 huevos', aj(190));
        expect(comp(p, '0').qty).toBe(4);
        expect(macrosDelPlato(p).calories).toBe(680);
        expect(ingredientesParaGuardar(p)[0]).toMatch(/^4 unidad de Huevo revuelto$/);
    });

    it('«Arepitas de maíz» renombra el panecillo y suma su ajuste; volver a «Panecillo» lo deja como estaba', () => {
        let p = conRespuesta(platoDesdeAnalisis(ANALISIS), 1, 1);
        expect(comp(p, '1').name).toBe('Arepitas de maíz');
        expect(comp(p, '1').display).toBe('Arepitas de maíz');
        expect(macrosDelPlato(p).calories).toBe(530);           // 490 + 40
        p = conRespuesta(p, 1, 0);
        expect(comp(p, '1').name).toBe('Panecillo');
        expect(macrosDelPlato(p).calories).toBe(490);
    });

    it('«sobre» suelto («huevo») casa con el único ingrediente que lo contiene', () => {
        const a = { ...ANALISIS, dudas: [{ ...ANALISIS.dudas[0], sobre: 'huevo' }] };
        expect(comp(conRespuesta(platoDesdeAnalisis(a), 0, 1), '0').qty).toBe(3);
    });

    it('sin ingrediente que case, todo sigue por el ajuste (como antes)', () => {
        const a = { ...ANALISIS, dudas: [{ ...ANALISIS.dudas[0], sobre: 'aceite' }] };
        const p = conRespuesta(platoDesdeAnalisis(a), 0, 1);
        expect(comp(p, '0').qty).toBe(2);
        expect(macrosDelPlato(p).calories).toBe(585);           // 490 + 95
    });

    it('lee el número del principio: enteros, coma, ½ y 1/2', () => {
        const casos = ['1/2 taza', '1 1/2 tazas', '3 huevos', '½ taza', '1½ lascas', '2,5 onzas', 'Solo claras', 'Arepa'];
        expect(casos.map(numeroDeRespuesta)).toEqual([0.5, 1.5, 3, 0.5, 1.5, 2.5, null, null]);
    });

    it('números con fracción o coma: «1½ taza», «0,5»', () => {
        const a = { ...ANALISIS, dudas: [{ sobre: 'Queso', pregunta: '¿Cuánto queso?', opciones: [
            { texto: '2 lascas', supuesta: true, ajuste: aj(0) }, { texto: '1½ lascas', supuesta: false, ajuste: aj(-38) }, { texto: '0,5 lasca', supuesta: false, ajuste: aj(-112) },
        ] }] };
        expect(comp(conRespuesta(platoDesdeAnalisis(a), 0, 1), '2').qty).toBe(1.5);
        expect(comp(conRespuesta(platoDesdeAnalisis(a), 0, 2), '2').qty).toBe(0.5);
    });
});
