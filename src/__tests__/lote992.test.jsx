// frontend/src/__tests__/lote992.test.jsx
// [P1-PLAN-LOTE-992 · 2026-11-12] El Resumen del panel. El rojo del CAMBIO ya no pinta la CIFRA («Cuentas nuevas: 1»
// salía en rojo como una alarma); cada tarjeta lleva su línea de contexto y su minigráfica; la del estado del sistema
// lleva a «Requiere atención» — y solo es un botón si esa sección está en la página.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const serie = (valores) => valores.map((v, i) => ({ etiqueta: `${i + 6} nov`, valor: v, texto: String(v) }));
const RESUMEN = { id: 'resumen', seccion: 'Resumen', titulo: 'Últimos 7 días', tipo: 'resumen', tarjetas: [
    { etiqueta: 'Usuarios activos', valor: '7', cambio: 'Igual que los 7 días anteriores', tono: 'neutro',
      extra: 'Hoy: 1', serie: serie([6, 0, 3]), serie_titulo: 'Por día' },
    { etiqueta: 'Cuentas nuevas', valor: '1', cambio: '↓ 2 frente a los 7 días anteriores (3)', tono: 'malo' },
    { etiqueta: 'Estado del sistema', valor: '2 críticos', tono: 'malo', tono_valor: 'malo',
      extra: 'y 17 avisos por revisar', ayuda: 'Pulsa para ver el detalle.', destino: 'Requiere atención' },
] };
const ATENCION = { id: 'atencion', seccion: 'Requiere atención', titulo: 'Avisos abiertos', tipo: 'avisos', items: [],
                   vacio: 'Nada pendiente.' };

const montar = (bloques) => {
    fetchWithAuth.mockImplementation(async (url) => respuesta(url.startsWith('/api/admin/yo') ? { ok: true } : {
        dias: 7, generado: '2026-11-12T17:07:00+00:00', bloques }));
    return render(
        <MemoryRouter initialEntries={['/admin']}>
            <Routes><Route path="/admin" element={<AdminPage />} /></Routes>
        </MemoryRouter>,
    );
};
const tarjeta = async (etiqueta) => (await screen.findByText(etiqueta)).closest('li');

describe('[992] el Resumen del panel', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('el tono del cambio no colorea la cifra', async () => {
        montar([RESUMEN, ATENCION]);
        const nuevas = await tarjeta('Cuentas nuevas');
        expect(nuevas).toHaveAttribute('data-tono', 'malo');
        expect(within(nuevas).getByText('1')).not.toHaveAttribute('data-tono-valor');
        const estado = await tarjeta('Estado del sistema');
        expect(within(estado).getByText('2 críticos')).toHaveAttribute('data-tono-valor', 'malo');
    });

    it('sin tono_valor (backend anterior) se colorea solo la tarjeta sin cambio', async () => {
        const viejo = { ...RESUMEN, tarjetas: RESUMEN.tarjetas.map(({ tono_valor: _tonoValor, ...t }) => t) };
        montar([viejo, ATENCION]);
        expect(within(await tarjeta('Estado del sistema')).getByText('2 críticos')).toHaveAttribute('data-tono-valor', 'malo');
        expect(within(await tarjeta('Cuentas nuevas')).getByText('1')).not.toHaveAttribute('data-tono-valor');
    });

    it('la línea de contexto y la minigráfica', async () => {
        montar([RESUMEN, ATENCION]);
        const activos = await tarjeta('Usuarios activos');
        expect(within(activos).getByText('Hoy: 1')).toBeInTheDocument();
        const mini = within(activos).getByRole('img');
        expect(mini).toHaveAttribute('aria-label', 'Por día: 6 nov: 6, 7 nov: 0, 8 nov: 3 (en curso)');
        const barras = mini.querySelectorAll('span');
        expect([...barras].map((b) => b.style.height)).toEqual(['100%', '0%', '50%']);
        expect(barras[1]).toHaveAttribute('data-cero', 'true');
        expect(barras[2]).toHaveAttribute('data-actual', 'true');
        expect(within(await tarjeta('Cuentas nuevas')).queryByRole('img')).toBeNull();
    });

    it('la barra más pequeña se ve: nunca menos del 8 %', async () => {
        montar([{ ...RESUMEN, tarjetas: [{ ...RESUMEN.tarjetas[0], serie: serie([100, 1]) }] }]);
        const barras = within(await tarjeta('Usuarios activos')).getByRole('img').querySelectorAll('span');
        expect(barras[1].style.height).toBe('8%');
    });

    it('el estado lleva a «Requiere atención»', async () => {
        const scroll = vi.fn();
        Element.prototype.scrollIntoView = scroll;
        montar([RESUMEN, ATENCION]);
        const estado = await tarjeta('Estado del sistema');
        fireEvent.click(within(estado).getByRole('button'));
        expect(scroll).toHaveBeenCalledTimes(1);
        expect(scroll.mock.instances[0]).toHaveAttribute('data-seccion', 'Requiere atención');
        expect(document.activeElement).toHaveTextContent('Requiere atención');
    });

    it('sin esa sección en la página, no hay botón', async () => {
        montar([RESUMEN]);
        expect(within(await tarjeta('Estado del sistema')).queryByRole('button')).toBeNull();
    });
});
