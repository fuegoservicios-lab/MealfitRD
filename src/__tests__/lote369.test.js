// [P1-PLAN-LOTE-369 · 2026-09-26] La respuesta de una duda solo toca el ingrediente cuando de verdad habla de él.
//
// Auditoría de «Registrar comida» (tres defectos que guardaban datos equivocados sin avisar):
//   1. Una respuesta SIN número renombraba el ingrediente: «¿Frito o a la plancha?» → «A la plancha» guardaba
//      «1 unidad de A la plancha» y el pollo desaparecía (ni diario ni Nevera). Ahora solo se renombra cuando las
//      opciones NOMBRAN el ingrediente (la supuesta es su nombre: «Panecillo» / «Arepitas de maíz»); si no, manda el
//      ajuste, como antes del 362.
//   2. El número se aplicaba en la unidad del ingrediente sin mirar la de la respuesta: arroz de 180 g con «1 taza»
//      quedaba en 1 g (600 → 302 kcal). Ahora el número cambia la cantidad solo si la respuesta habla en SU unidad
//      («2 tazas» con taza, «4 huevos» con unidad de Huevo…) o si el servidor dio la `cantidad` en esa unidad (363).
//   5. Tras «Cambiar» un ingrediente (365), su duda ya no lo encontraba (buscaba por el nombre de antes del 362).
// Y si una respuesta ya no toca el ingrediente, lo que la anterior le hizo se deshace (no se queda a medias).
import { describe, it, expect } from 'vitest';
import {
    platoDesdeAnalisis, conRespuesta, conRespuestaEscrita, macrosDelPlato, ingredientesParaGuardar, conIngredienteCambiado,
} from '../components/dashboard/scanMealDishes';

const aj = (calories) => ({ calories, protein: 0, carbs: 0, healthy_fats: 0 });
const comp = (p, k) => p.componentes.find((c) => c.key === k);
const plato = (items, dudas) => platoDesdeAnalisis({
    meal_name: 'Plato', macros: aj(items.reduce((s, i) => s + i.macros.calories, 0)), items, dudas,
});

describe('[369] respuestas que no hablan del ingrediente', () => {
    const POLLO = plato(
        [{ name: 'Pollo', quantity: 1, unit: 'unidad', macros: aj(300) }, { name: 'Arroz', quantity: 1, unit: 'taza', macros: aj(200) }],
        [{ sobre: 'Pollo', pregunta: '¿Frito o a la plancha?', opciones: [
            { texto: 'Frito', supuesta: true, ajuste: aj(0) }, { texto: 'A la plancha', supuesta: false, ajuste: aj(-80) },
        ] }],
    );

    it('«A la plancha» no renombra el pollo: manda el ajuste', () => {
        const p = conRespuesta(POLLO, 0, 1);
        expect(comp(p, '0').name).toBe('Pollo');
        expect(macrosDelPlato(p).calories).toBe(420);
        expect(ingredientesParaGuardar(p)[0]).toBe('1 unidad de Pollo');
    });

    it('lo escrito sin número tampoco («con salsa»)', () => {
        const p = conRespuestaEscrita(POLLO, 0, 'con salsa', aj(60));
        expect(comp(p, '0').name).toBe('Pollo');
        expect(macrosDelPlato(p).calories).toBe(560);
    });
});

describe('[369] el número se aplica solo en la unidad del ingrediente', () => {
    const ARROZ = plato(
        [{ name: 'Arroz blanco', quantity: 180, unit: 'g', macros: aj(250) }, { name: 'Habichuelas', quantity: 1, unit: 'taza', macros: aj(350) }],
        [{ sobre: 'Arroz blanco', pregunta: '¿Cuánto arroz?', opciones: [
            { texto: '1 taza', supuesta: true, ajuste: aj(0) }, { texto: '2 tazas', supuesta: false, ajuste: aj(250) },
        ] }],
    );

    it('«1 taza» con el arroz en gramos no lo deja en 1 g', () => {
        const p = conRespuesta(ARROZ, 0, 0);
        expect(comp(p, '0').qty).toBe(180);
        expect(macrosDelPlato(p).calories).toBe(600);
    });

    it('«2 tazas» suma su ajuste y deja los gramos', () => {
        const p = conRespuesta(ARROZ, 0, 1);
        expect(comp(p, '0').qty).toBe(180);
        expect(macrosDelPlato(p).calories).toBe(850);
    });

    it('en su unidad sí: «2 tazas» de habichuelas en taza', () => {
        const p = conRespuesta(plato(
            [{ name: 'Habichuelas', quantity: 1, unit: 'taza', macros: aj(350) }],
            [{ sobre: 'Habichuelas', pregunta: '¿Cuántas?', opciones: [
                { texto: '1 taza', supuesta: true, ajuste: aj(0) }, { texto: '2 tazas', supuesta: false, ajuste: aj(350) },
            ] }],
        ), 0, 1);
        expect(comp(p, '0').qty).toBe(2);
        expect(macrosDelPlato(p).calories).toBe(700);
    });

    it('una respuesta sin número deshace la cantidad que puso la anterior', () => {
        const HUEVOS = plato(
            [{ name: 'Huevo revuelto', quantity: 2, unit: 'unidad', macros: aj(190) }],
            [{ sobre: 'Huevo revuelto', pregunta: '¿Cuántos?', opciones: [
                { texto: '2 huevos', supuesta: true, ajuste: aj(0) }, { texto: '3 huevos', supuesta: false, ajuste: aj(95) },
            ] }],
        );
        let p = conRespuesta(HUEVOS, 0, 1);
        expect(comp(p, '0').qty).toBe(3);
        p = conRespuestaEscrita(p, 0, 'con aceite', aj(40));
        expect(comp(p, '0').qty).toBe(2);
        expect(macrosDelPlato(p).calories).toBe(230);
    });
});

describe('[369] «Cambiar» y la duda del mismo ingrediente', () => {
    const HUEVOS = () => plato(
        [{ name: 'Huevo revuelto', quantity: 2, unit: 'unidad', macros: aj(190) }],
        [{ sobre: 'Huevo revuelto', pregunta: '¿Cuántos?', opciones: [
            { texto: '2 huevos', supuesta: true, ajuste: aj(0) }, { texto: '4 huevos', supuesta: false, ajuste: aj(190) },
        ] }],
    );

    it('Cambiar primero y responder después: la duda lo encuentra', () => {
        let p = conIngredienteCambiado(HUEVOS(), '0', 'Huevo frito', aj(240), aj(190));
        p = conRespuesta(p, 0, 1);
        expect(comp(p, '0').name).toBe('Huevo frito');
        expect(comp(p, '0').qty).toBe(4);
        expect(macrosDelPlato(p).calories).toBe(480);
    });

    it('responder, Cambiar y volver a responder: la cantidad sigue a la respuesta', () => {
        let p = conRespuesta(HUEVOS(), 0, 1);
        p = conIngredienteCambiado(p, '0', 'Huevo frito', aj(480), aj(380));
        p = conRespuesta(p, 0, 0);
        expect(comp(p, '0').qty).toBe(2);
        expect(macrosDelPlato(p).calories).toBe(240);
    });
});
