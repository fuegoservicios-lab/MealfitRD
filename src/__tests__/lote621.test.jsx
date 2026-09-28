// frontend/src/__tests__/lote621.test.jsx
// [P1-PLAN-LOTE-621 · 2026-09-27] /admin se lee de un vistazo. El dueño: «mejora cómo se ve». Las tablas se cortaban
// (la columna del coste no cabía), todas las filas pesaban igual, las subfilas iban marcadas con «· » dentro del texto
// y un cero parecía un dato. Ahora: cifras principales en grande, subfilas sangradas, ceros apagados, tablas a lo ancho
// con números alineados a la derecha y barras de proporción, nota bajo el bloque y hora de la última carga.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const METRICAS = {
    dias: 7,
    generado: '2026-09-27T23:49:22+00:00',
    bloques: [
        { id: 'uso', titulo: 'Uso', tipo: 'kpis', filas: [
            { etiqueta: 'Activas en 7 días', valor: '3', destacado: true },
            { etiqueta: 'Cuentas', valor: '12' },
        ] },
        { id: 'escaner', titulo: 'Escáner', tipo: 'kpis', nota: 'Se registra desde el 27-09-2026.', filas: [
            { etiqueta: 'Corregidos por el usuario', valor: '40 %', destacado: true },
            { etiqueta: 'Editó cantidades', valor: '0 %', nivel: 1 },
            { etiqueta: '· cambió un ingrediente', valor: '10 %' },
        ] },
        { id: 'gasto', titulo: 'Gasto de IA (7 días): US$1.26', tipo: 'tabla',
          columnas: ['Función', 'Llamadas', 'Coste'],
          filas: [['Generación de días', '107', 'US$0.54'], ['Escáner de fotos', '58', 'US$0.22']],
          barras: [0.4286, 0.1746] },
    ],
};
const montar = () => render(
    <MemoryRouter initialEntries={['/admin']}>
        <Routes>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/dashboard" element={<p>DASHBOARD</p>} />
        </Routes>
    </MemoryRouter>,
);

describe('[621] /admin se lee de un vistazo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchWithAuth.mockImplementation(async (url) => respuesta(url.startsWith('/api/admin/yo') ? { ok: true } : METRICAS));
    });

    it('las cifras principales van aparte, en grande, y no se repiten en la lista', async () => {
        montar();
        const uso = (await screen.findByText('Uso')).closest('section');
        const principales = within(uso).getByRole('list', { name: 'Cifras principales' });
        expect(within(principales).getByText('3')).toBeInTheDocument();
        expect(within(principales).getByText('Activas en 7 días')).toBeInTheDocument();
        expect(within(uso).getAllByText('Activas en 7 días')).toHaveLength(1);
        expect(within(uso).getByText('Cuentas')).toBeInTheDocument();
    });

    it('subfila por nivel o por la marca vieja «· », sin la marca en el texto', async () => {
        montar();
        const esc = (await screen.findByText('Escáner')).closest('section');
        const porNivel = within(esc).getByText('Editó cantidades').closest('[data-nivel]');
        expect(porNivel).toHaveAttribute('data-nivel', '1');
        const porMarca = within(esc).getByText('cambió un ingrediente').closest('[data-nivel]');
        expect(porMarca).toHaveAttribute('data-nivel', '1');
        expect(within(esc).queryByText('· cambió un ingrediente')).toBeNull();
    });

    it('un cero se ve apagado y la nota del bloque se pinta', async () => {
        montar();
        const esc = (await screen.findByText('Escáner')).closest('section');
        expect(within(esc).getByText('0 %')).toHaveAttribute('data-cero', 'true');
        expect(within(esc).getByText('10 %')).not.toHaveAttribute('data-cero');
        expect(within(esc).getByText('Se registra desde el 27-09-2026.')).toBeInTheDocument();
    });

    it('la tabla ocupa el ancho, alinea los números y dibuja la proporción', async () => {
        montar();
        const gasto = (await screen.findByText('Gasto de IA (7 días): US$1.26')).closest('section');
        expect(gasto).toHaveAttribute('data-ancho', 'completo');
        expect(within(gasto).getByText('US$0.54').closest('td')).toHaveAttribute('data-numerica', 'true');
        expect(within(gasto).getByText('107').closest('td')).toHaveAttribute('data-numerica', 'true');
        expect(within(gasto).getByText('Generación de días').closest('td')).not.toHaveAttribute('data-numerica');
        const barras = gasto.querySelectorAll('[data-barra]');
        expect(barras).toHaveLength(2);
        expect(barras[0].style.width).toBe('43%');
    });

    it('dice cuándo se cargó y «Actualizar» vuelve a pedir', async () => {
        montar();
        await screen.findByText('Uso');
        expect(screen.getByText(/Actualizado a las \d{1,2}:\d{2}/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
        await waitFor(() => expect(fetchWithAuth.mock.calls.filter(([u]) => u === '/api/admin/metricas?dias=7')).toHaveLength(2));
    });
});


describe('[621] el bloque se ordena solo', () => {
    const conBloque = (bloque) => fetchWithAuth.mockImplementation(async (url) => respuesta(
        url.startsWith('/api/admin/yo') ? { ok: true } : { dias: 7, generado: METRICAS.generado, bloques: [bloque] }));
    beforeEach(() => vi.clearAllMocks());

    it('bajo un total en cero, sus subfilas no se pintan (no informan nada)', async () => {
        conBloque({ id: 'escaner', titulo: 'Escáner', tipo: 'kpis', filas: [
            { etiqueta: 'Corregidos por el usuario', valor: '0 %' },
            { etiqueta: 'Editó cantidades', valor: '0 %', nivel: 1 },
            { etiqueta: 'Tecleó las macros', valor: '0 %', nivel: 1 },
            { etiqueta: 'Desvío mediano', valor: '5 %' },
        ] });
        montar();
        expect(await screen.findByText('Corregidos por el usuario')).toBeInTheDocument();
        expect(screen.queryByText('Editó cantidades')).toBeNull();
        expect(screen.getByText('Desvío mediano')).toBeInTheDocument();
    });

    it('con el total por encima de cero, las subfilas se ven', async () => {
        conBloque({ id: 'escaner', titulo: 'Escáner', tipo: 'kpis', filas: [
            { etiqueta: 'Corregidos por el usuario', valor: '40 %' },
            { etiqueta: 'Editó cantidades', valor: '0 %', nivel: 1 },
        ] });
        montar();
        expect(await screen.findByText('Editó cantidades')).toBeInTheDocument();
    });

    it('un bloque con muchas filas ocupa el ancho y reparte su lista', async () => {
        const filas = Array.from({ length: 9 }, (_, i) => ({ etiqueta: `Fila ${i}`, valor: String(i + 1) }));
        conBloque({ id: 'x', titulo: 'Largo', tipo: 'kpis', filas });
        montar();
        const sec = (await screen.findByText('Largo')).closest('section');
        expect(sec).toHaveAttribute('data-ancho', 'completo');
    });

    it('el servidor puede pedirle a un bloque su propia fila', async () => {
        conBloque({ id: 'x', titulo: 'Pedido', tipo: 'kpis', ancho: true, filas: [{ etiqueta: 'A', valor: '1' }] });
        montar();
        expect((await screen.findByText('Pedido')).closest('section')).toHaveAttribute('data-ancho', 'completo');
    });

    it('una columna de texto largo pide ancho (no se parte en seis líneas en el móvil)', async () => {
        conBloque({ id: 'b', titulo: 'Banco', tipo: 'tabla', columnas: ['Fecha', 'Corrida', 'kcal'], filas: [
            ['2026-09-27 20:58', 'P1-PLAN-LOTE-601 v2: lo denso se cuenta (frutos secos…', '27 %'],
            ['2026-09-27 19:06', 'linea base', '26 %'],
        ] });
        montar();
        const sec = (await screen.findByText('Banco')).closest('section');
        expect(within(sec).getByText('linea base').closest('[data-texto-largo]')).not.toBeNull();
        expect(within(sec).getByText('2026-09-27 19:06').closest('[data-texto-largo]')).toBeNull();
    });

    it('uno corto no', async () => {
        conBloque({ id: 'x', titulo: 'Corto', tipo: 'kpis', filas: [{ etiqueta: 'A', valor: '1' }] });
        montar();
        expect((await screen.findByText('Corto')).closest('section')).not.toHaveAttribute('data-ancho');
    });
});
