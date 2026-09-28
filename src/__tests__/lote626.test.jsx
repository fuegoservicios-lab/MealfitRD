// [P1-PLAN-LOTE-626 · 2026-09-27] Las dudas de la foto se leen en el idioma del usuario.
//
// El servidor traduce la pregunta en su sitio y deja al lado de cada opción `texto_mostrar` (y `nombre_plato_mostrar`
// si la opción cambia el plato). `texto` y `nombre_plato` siguen en español: el primero puede renombrar el ingrediente
// (lo que se guarda y lo que descuenta la Nevera) y se compara con el nombre del ingrediente. Aquí: lo que se VE usa la
// traducción; lo que el motor usa, el español.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../i18n', () => ({ useT: () => (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k]) : s) }));

import DudasDeLaFoto from '../components/common/DudasDeLaFoto';
import { normalizarOpciones, mensajeDeRespuestas, normalizarDudas } from '../utils/dudasDeLaFoto';
import { platoDesdeAnalisis, conRespuesta } from '../components/dashboard/scanMealDishes';

const aj = (calories) => ({ calories, protein: 0, carbs: 0, healthy_fats: 0 });
const mac = (kcal) => ({ calories: kcal, protein: 0, carbs: 0, healthy_fats: 0 });
const DUDAS = [
    { sobre: 'Panecillo', pregunta: 'What base is it?', opciones: [
        { texto: 'Panecillo', texto_mostrar: 'Bread roll', supuesta: true, ajuste: aj(0) },
        { texto: 'Arepitas de maíz', texto_mostrar: 'Corn arepitas', supuesta: false, ajuste: aj(40),
          nombre_plato: 'Tortilla con arepitas', nombre_plato_mostrar: 'Omelette with arepitas' },
    ] },
];
const ANALISIS = {
    meal_name: 'Omelette with bread roll',
    macros: mac(340),
    items: [
        { name: 'Huevo revuelto', quantity: 2, unit: 'unidad', macros: mac(190) },
        { name: 'Panecillo', quantity: 2, unit: 'unidad', macros: mac(150) },
    ],
    dudas: DUDAS,
};

describe('[626] las dudas de la foto en el idioma del usuario', () => {
    it('la normalización conserva la traducción al lado del español', () => {
        const [o0, o1] = normalizarOpciones(DUDAS[0].opciones);
        expect(o0).toMatchObject({ texto: 'Panecillo', texto_mostrar: 'Bread roll' });
        expect(o1).toMatchObject({ nombre_plato: 'Tortilla con arepitas', nombre_plato_mostrar: 'Omelette with arepitas' });
    });

    it('sin traducción (español o servidor anterior) todo sigue igual', () => {
        const [o] = normalizarOpciones([{ texto: '2 huevos', ajuste: {} }, { texto: '3 huevos', ajuste: {} }]);
        expect(o.texto_mostrar).toBeUndefined();
        expect(o.nombre_plato_mostrar).toBeUndefined();
    });

    it('los botones y la respuesta confirmada enseñan la traducción', () => {
        const dudas = normalizarDudas(DUDAS);
        const { rerender } = render(<DudasDeLaFoto dudas={dudas} respuestas={{}} confirmadas={{}} onElegir={() => {}} />);
        expect(screen.getByRole('button', { name: 'Corn arepitas' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Arepitas de maíz' })).toBeNull();
        rerender(<DudasDeLaFoto dudas={dudas} respuestas={{ 0: 1 }} confirmadas={{ 0: true }} onElegir={() => {}} />);
        expect(screen.getByText('Corn arepitas')).toBeInTheDocument();
    });

    it('elegir la opción renombra el plato con su traducción y el ingrediente con el español', () => {
        const p = conRespuesta(platoDesdeAnalisis(ANALISIS), 0, 1);
        expect(p.nombre).toBe('Omelette with arepitas');
        const pan = p.componentes.find((c) => c.key === '1');
        expect(pan.name).toBe('Arepitas de maíz');      // identificador: Nevera y motor
        expect(pan.display).toBe('Corn arepitas');      // lo que se lee
    });

    it('al chat va lo que el usuario leyó', () => {
        expect(mensajeDeRespuestas(normalizarDudas(DUDAS), [1])).toBe('Corn arepitas');
    });
});
