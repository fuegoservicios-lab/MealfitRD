// [P1-STAPLE-SEARCH-RANK · 2026-08-09] El buscador de "Mis básicos" ordenaba por
// alfabeto y cortaba a 8 ANTES de ordenar.
//
// REPORTE DEL OWNER (captura del paso 15 en móvil): escribió «hu» y le salieron
// «Clara de huevo», tres habichuelas, y «Huevo» en QUINTO lugar — debajo de
// alimentos que solo contienen esas letras EN MEDIO (le-chu-ga, pe-chu-ga,
// ha-bichu-elas). Preguntó si no sobraba tener clara de huevo y huevo separados.
//
// La respuesta fue que no: en el catálogo son alimentos distintos de verdad
// (~52 kcal y 0 g de grasa frente a ~155 y ~11), y ese catálogo alimenta la lista
// de compras, el descuento de la Nevera y los macros. Lo que sí estaba mal era el
// ORDEN, y que nada le dijera que para la variedad ambos cuentan como uno solo.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import { QStapleFoods } from '../components/assessment/questions/QStapleFoods';
import { _resetPantryCacheForTests, setCachedMasterList } from '../utils/pantryCache';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

// El catálogo EXACTO que produjo la captura, en el orden alfabético en que lo
// sirve el backend (ORDER BY name).
const CATALOGO = [
    { id: '1', name: 'Clara de huevo', staple_gate_label: 'huevo' },
    { id: '2', name: 'Habichuelas blancas', staple_gate_label: null },
    { id: '3', name: 'Habichuelas negras', staple_gate_label: null },
    { id: '4', name: 'Habichuelas rojas', staple_gate_label: null },
    { id: '5', name: 'Huevo', staple_gate_label: 'huevo' },
    { id: '6', name: 'Lechuga', staple_gate_label: null },
    { id: '7', name: 'Lechuga romana', staple_gate_label: null },
    { id: '8', name: 'Pechuga de pavo', staple_gate_label: 'pavo' },
    { id: '9', name: 'Pollo', staple_gate_label: 'pollo' },
];

const montar = (formData, updateData = vi.fn()) => {
    render(<QStapleFoods onManualAdvance={vi.fn()} />, {
        customContext: { formData, updateData },
    });
    return updateData;
};

describe('[P1-STAPLE-SEARCH-RANK] el buscador ordena por relevancia', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetPantryCacheForTests();
        setCachedMasterList(CATALOGO);
    });

    it('«hu» pone «Huevo» PRIMERO, no quinto detrás de las habichuelas', async () => {
        const user = userEvent.setup();
        montar({ stapleFoods: [] });
        await user.type(screen.getByPlaceholderText(/Busca un alimento/i), 'hu');
        const opciones = await screen.findAllByRole('option');
        expect(opciones[0]).toHaveTextContent('Huevo');
    });

    it('lo que EMPIEZA por lo escrito va por encima de lo que solo lo contiene', async () => {
        const user = userEvent.setup();
        montar({ stapleFoods: [] });
        await user.type(screen.getByPlaceholderText(/Busca un alimento/i), 'hu');
        const textos = (await screen.findAllByRole('option')).map(o => o.textContent);
        // «Huevo» empieza por «hu»; «Habichuelas…» y «Lechuga» solo lo llevan dentro.
        expect(textos.indexOf('Huevo')).toBeLessThan(textos.indexOf('Lechuga'));
        expect(textos.indexOf('Huevo')).toBeLessThan(textos.indexOf('Habichuelas blancas'));
    });

    it('una palabra INTERIOR que empieza por lo escrito gana a la coincidencia a media palabra', async () => {
        const user = userEvent.setup();
        // El ejemplo canónico de esta casa: «pollo» ⊂ «repollo». Alfabéticamente
        // Repollo va último y Caldo primero, así que el orden correcto NO puede
        // salir por casualidad: exacto → palabra interior → dentro de otra palabra.
        _resetPantryCacheForTests();
        setCachedMasterList([
            { id: 'a', name: 'Caldo de pollo', staple_gate_label: 'pollo' },
            { id: 'b', name: 'Pollo', staple_gate_label: 'pollo' },
            { id: 'c', name: 'Repollo', staple_gate_label: null },
        ]);
        montar({ stapleFoods: [] });
        await user.type(screen.getByPlaceholderText(/Busca un alimento/i), 'pollo');
        const textos = (await screen.findAllByRole('option')).map(o => o.textContent);
        expect(textos).toEqual(['Pollo', 'Caldo de pollo', 'Repollo']);
    });

    it('el corte a 8 no se lleva por delante la coincidencia exacta', async () => {
        const user = userEvent.setup();
        // 8 señuelos alfabéticamente ANTERIORES que contienen «pollo» en medio, más
        // el exacto al final. Ordenar después de cortar lo dejaría fuera.
        const señuelos = Array.from({ length: 8 }, (_, i) => ({
            id: `d${i}`, name: `Caldo de pollo ${i}`, staple_gate_label: 'pollo',
        }));
        _resetPantryCacheForTests();
        setCachedMasterList([...señuelos, { id: 'x', name: 'Pollo', staple_gate_label: 'pollo' }]);
        montar({ stapleFoods: [] });
        await user.type(screen.getByPlaceholderText(/Busca un alimento/i), 'pollo');
        const opciones = await screen.findAllByRole('option');
        expect(opciones[0]).toHaveTextContent('Pollo');
    });
});

describe('[P1-STAPLE-SEARCH-RANK] avisa cuando dos básicos son uno solo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetPantryCacheForTests();
        setCachedMasterList(CATALOGO);
    });

    it('avisa que «Clara de huevo» y «Huevo» cuentan como el mismo alimento', () => {
        montar({ stapleFoods: ['Huevo', 'Clara de huevo'] });
        const aviso = screen.getByRole('status');
        expect(aviso).toHaveTextContent(/mismo alimento/i);
        expect(aviso).toHaveTextContent(/Huevo/);
        expect(aviso).toHaveTextContent(/Clara de huevo/);
    });

    it('NO bloquea ni castiga: solo informa, y dice que funciona igual', () => {
        // Un aviso que impidiera elegir enseñaría a no declarar. Además el nombre
        // crudo sí llega al prompt de generación, así que elegir ambos no es un error.
        montar({ stapleFoods: ['Huevo', 'Clara de huevo'] });
        expect(screen.getByRole('status')).toHaveTextContent(/funciona igual/i);
        expect(screen.getByRole('button', { name: /Siguiente/i })).not.toBeDisabled();
    });

    it('no avisa cuando los básicos NO compiten entre sí', () => {
        montar({ stapleFoods: ['Huevo', 'Pollo'] });
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('no agrupa lo que el gate ni mira (legumbres/vegetales ya pueden repetirse)', () => {
        montar({ stapleFoods: ['Habichuelas rojas', 'Habichuelas negras', 'Lechuga'] });
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('con un catálogo viejo en caché (sin el rótulo) no avisa ni revienta', () => {
        _resetPantryCacheForTests();
        setCachedMasterList(CATALOGO.map(({ staple_gate_label: _omitido, ...resto }) => resto));
        montar({ stapleFoods: ['Huevo', 'Clara de huevo'] });
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('button', { name: /Siguiente/i })).toBeInTheDocument();
    });
});
