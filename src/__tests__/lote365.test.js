// [P1-PLAN-LOTE-365 · 2026-09-26] Corregir lo que la foto creyó ver: un ingrediente, o el plato entero.
//
// El dueño: «quiero la opción de cambiar un ingrediente: el queso no lo pude cambiar y nombrar su marca, mozzarella;
// en esta tampoco puedo decir que es una simple batida de lechosa con leche». La lista de ingredientes solo dejaba
// marcar y cambiar la cantidad. Ahora:
//   · «Cambiar» en cada ingrediente: el nombre nuevo va al servidor con su cantidad y vuelve con las macros del nuevo
//     y del anterior. Con desglose, la fila toma las nuevas; sin desglose, el plato suma la diferencia. Lo que se
//     guarda (y baja de la Nevera) es el nombre nuevo. Escribir el nombre original lo deja como estaba.
//   · «¿No es esto? Descríbelo»: el plato se rehace con lo que devuelve «Descríbelo y lo calculo» (348): nombre,
//     ingredientes editables y macros; las dudas de la foto se van (eran sobre lo que la IA creyó ver).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    platoDesdeAnalisis, macrosDelPlato, ingredientesParaGuardar, conPorcion,
    conIngredienteCambiado, esNombreOriginal, platoDesdeDescripcion,
} from '../components/dashboard/scanMealDishes';

const mac = (calories, protein = 0, carbs = 0, healthy_fats = 0) => ({ calories, protein, carbs, healthy_fats });
const ANALISIS = {
    meal_name: 'Sándwich de jamón y queso',
    macros: mac(490),
    items: [
        { name: 'Pan', quantity: 2, unit: 'rebanada', macros: mac(160) },
        { name: 'Jamón', quantity: 2, unit: 'lasca', macros: mac(180) },
        { name: 'Queso', quantity: 2, unit: 'lasca', macros: mac(150) },
    ],
    dudas: [{ sobre: 'Pan', pregunta: '¿Qué pan?', opciones: [
        { texto: 'Pan de molde', supuesta: true, ajuste: mac(0) }, { texto: 'Pan integral', supuesta: false, ajuste: mac(-10) },
    ] }],
};
const queso = (p) => p.componentes.find((c) => c.key === '2');

describe('[365] «Cambiar» un ingrediente', () => {
    it('con desglose: la fila toma el nombre y las macros nuevas; el total sale de ahí', () => {
        const p = conIngredienteCambiado(platoDesdeAnalisis(ANALISIS), '2', 'Queso mozzarella', mac(160, 12, 2, 12), mac(150));
        expect(queso(p).name).toBe('Queso mozzarella');
        expect(queso(p).display).toBe('');
        expect(macrosDelPlato(p).calories).toBe(500);           // 160 + 180 + 160
        expect(ingredientesParaGuardar(p)[2]).toBe('2 lasca de Queso mozzarella');
    });

    it('las macros del servidor son de la cantidad ACTUAL: a porción 2× se reparten a la cantidad detectada', () => {
        let p = conPorcion(platoDesdeAnalisis(ANALISIS), 2);
        p = conIngredienteCambiado(p, '2', 'Queso mozzarella', mac(320), mac(300));   // 4 lascas
        expect(queso(p).macros.calories).toBe(160);             // por las 2 lascas detectadas
        expect(macrosDelPlato(p).calories).toBe(1000);          // (160 + 180 + 160) × 2
    });

    it('sin desglose: el plato suma la diferencia (nuevo − anterior)', () => {
        const sin = { ...ANALISIS, items: ANALISIS.items.map(({ macros: _m, ...i }) => i) };
        let p = conIngredienteCambiado(platoDesdeAnalisis(sin), '2', 'Queso mozzarella', mac(160), mac(140));
        expect(queso(p).name).toBe('Queso mozzarella');
        expect(macrosDelPlato(p).calories).toBe(510);           // 490 + 20
        p = conIngredienteCambiado(p, '2', 'Queso cheddar', mac(170), mac(140));
        expect(macrosDelPlato(p).calories).toBe(520);           // reemplaza el cambio anterior, no lo acumula
    });

    it('escribir el nombre original (sin mayúsculas ni acentos) lo deja como estaba', () => {
        const orig = platoDesdeAnalisis(ANALISIS);
        let p = conIngredienteCambiado(orig, '2', 'Queso mozzarella', mac(160), mac(150));
        expect(esNombreOriginal(queso(p), '  QUESO ')).toBe(true);
        expect(esNombreOriginal(queso(p), 'Queso mozzarella')).toBe(false);
        p = conIngredienteCambiado(p, '2', 'queso', null, null);
        expect(queso(p).name).toBe('Queso');
        expect(macrosDelPlato(p).calories).toBe(490);
    });
});

describe('[365] «¿No es esto? Descríbelo»', () => {
    const DESCRITO = {
        name: 'Batida de lechosa con leche',
        lineas: [
            { ref: 'custom', name: 'Lechosa', grams: 150, macros: { kcal: 60, protein: 1, carbs: 15, fats: 0 }, estimated: true },
            { ref: 'custom', name: 'Leche entera', grams: 240, macros: { kcal: 150, protein: 8, carbs: 12, fats: 8 }, estimated: true },
            { ref: 'custom', name: 'Azúcar', grams: null, macros: { kcal: 30, protein: 0, carbs: 8, fats: 0 }, estimated: true },
        ],
    };

    it('rehace nombre, ingredientes y macros; quita las dudas; conserva lo demás del plato', () => {
        const antes = { ...platoDesdeAnalisis(ANALISIS), id: 'p1', estado: 'listo', fotoUrl: 'blob:x' };
        const p = platoDesdeDescripcion(antes, DESCRITO);
        expect(p.nombre).toBe('Batida de lechosa con leche');
        expect(p.componentes.map((c) => [c.name, c.qty, c.unit])).toEqual([
            ['Lechosa', 150, 'g'], ['Leche entera', 240, 'g'], ['Azúcar', 1, 'porción'],
        ]);
        expect(p.desglose).toBe(true);
        expect(p.dudas).toEqual([]);
        expect(macrosDelPlato(p)).toEqual({ calories: 240, protein: 9, carbs: 35, healthy_fats: 8 });
        expect([p.id, p.estado, p.fotoUrl]).toEqual(['p1', 'listo', 'blob:x']);
        expect(ingredientesParaGuardar(p)[0]).toBe('150 g de Lechosa');
    });

    it('sin líneas no cambia nada', () => {
        const antes = platoDesdeAnalisis(ANALISIS);
        expect(platoDesdeDescripcion(antes, { name: 'x', lineas: [] })).toBe(antes);
    });

    it('la hoja llama a los dos endpoints', () => {
        const src = readFileSync(resolve(__dirname, '..', 'components', 'dashboard', 'ScanMealModal.jsx'), 'utf8');
        expect(src).toContain("'/api/diary/scan/ingrediente'");
        expect(src).toContain("'/api/diary/consumed/estimate-plate'");
        expect(src).toContain('platoDesdeDescripcion(p, data)');
        // mientras se corrige, «Volver a escanear» se esconde como con «Otra…» (362)
        expect(src).toContain("const editandoAlgo = dudaAbierta || corrigiendo !== null || calculandoCorreccion !== null;");
        expect(src).toContain('onEditando={setDudaAbierta}');
    });
});
