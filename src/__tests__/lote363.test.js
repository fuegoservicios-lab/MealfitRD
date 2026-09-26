// [P1-PLAN-LOTE-363 · 2026-09-26] «4 huevos con 3 yemas»: la cantidad del ingrediente Y el resto de lo dicho.
//
// El dueño: «si escribo "4 huevos con 3 yemas" tiene que entender que me comí 4 huevos pero le quité una yema». El
// 362 ponía el huevo en 4 y tiraba el ajuste del servidor (con desglose, contarlo sería doble): la yema quitada se
// perdía. Ahora el servidor dice `cantidad` (4) y el ajuste TOTAL (+2 huevos −1 yema); el huevo va a 4 y lo que no
// cabe en «4 unidades» (la yema) se suma aparte. La nota se ve junto al ingrediente; lo que se guarda y baja de la
// Nevera sigue siendo el ingrediente («4 unidad de Huevo revuelto»).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { platoDesdeAnalisis, conRespuesta, conRespuestaEscrita, macrosDelPlato, ingredientesParaGuardar } from '../components/dashboard/scanMealDishes';

const aj = (calories) => ({ calories, protein: 0, carbs: 0, healthy_fats: 0 });
const ANALISIS = {
    meal_name: 'Tortilla con panecillo',
    macros: aj(490),
    items: [
        { name: 'Huevo revuelto', quantity: 2, unit: 'unidad', macros: aj(190) },
        { name: 'Panecillo', quantity: 2, unit: 'unidad', macros: aj(300) },
    ],
    dudas: [{ sobre: 'Huevo revuelto', pregunta: '¿De cuántos huevos?', opciones: [
        { texto: '2 huevos', supuesta: true, ajuste: aj(0) },
        { texto: '3 huevos', supuesta: false, ajuste: aj(95) },
    ] }],
};
const huevo = (p) => p.componentes.find((c) => c.key === '0');

describe('[363] lo escrito en «Otra…» lleva cantidad y detalle', () => {
    it('«4» a secas pone 4 en el huevo', () => {
        const p = conRespuestaEscrita(platoDesdeAnalisis(ANALISIS), 0, '4', aj(190));
        expect(huevo(p).qty).toBe(4);
        expect(macrosDelPlato(p).calories).toBe(680);
    });

    it('«4 huevos con 3 yemas»: huevo en 4 y la yema de menos se resta aparte', () => {
        // servidor: cantidad 4, total +135 (= +190 de dos huevos − 55 de una yema)
        const p = conRespuestaEscrita(platoDesdeAnalisis(ANALISIS), 0, '4 huevos con 3 yemas', aj(135), '', 4);
        expect(huevo(p).qty).toBe(4);
        expect(macrosDelPlato(p).calories).toBe(625);           // 490 + 135, no 680
        expect(huevo(p).display).toBe('Huevo revuelto (4 huevos con 3 yemas)');
        expect(ingredientesParaGuardar(p)[0]).toBe('4 unidad de Huevo revuelto');
    });

    it('la cantidad del servidor gana al número del texto («una docena… no, 3»)', () => {
        const p = conRespuestaEscrita(platoDesdeAnalisis(ANALISIS), 0, 'tres huevos', aj(95), '', 3);
        expect(huevo(p).qty).toBe(3);
        expect(macrosDelPlato(p).calories).toBe(585);
    });

    it('volver a la supuesta deshace cantidad, detalle y nota', () => {
        let p = conRespuestaEscrita(platoDesdeAnalisis(ANALISIS), 0, '4 huevos con 3 yemas', aj(135), '', 4);
        p = conRespuesta(p, 0, 0);
        expect(huevo(p).qty).toBe(2);
        expect(huevo(p).display).toBe('');
        expect(macrosDelPlato(p).calories).toBe(490);
    });

    it('sin desglose, el ajuste total ya entra entero (una sola vez)', () => {
        const sin = { ...ANALISIS, items: ANALISIS.items.map(({ macros: _m, ...i }) => i) };
        const p = conRespuestaEscrita(platoDesdeAnalisis(sin), 0, '4 huevos con 3 yemas', aj(135), '', 4);
        expect(macrosDelPlato(p).calories).toBe(625);
    });

    it('el escáner manda el ingrediente de la duda y lee `cantidad`', () => {
        const src = readFileSync(resolve(__dirname, '..', 'components', 'dashboard', 'ScanMealModal.jsx'), 'utf8');
        expect(src).toContain('ingrediente: ingredienteDeLaDuda(plato, i)');
        expect(src).toContain('data.nombre_plato, data.cantidad)');
    });
});
