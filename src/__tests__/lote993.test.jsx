// frontend/src/__tests__/lote993.test.jsx
// [P1-PLAN-LOTE-993 · 2026-11-12] «Requiere atención» se entiende: cada grupo dice qué significa, lo que ya no aplica
// se dice («Ya no aplica»), y una fila se puede «Marcar como revisado» con dos pulsaciones — la segunda manda sus
// huellas (nunca ids) con la cabecera de acción y vuelve a cargar el panel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../pages/AdminAjustesResumen', () => ({ default: () => null }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const ATENCION = { id: 'atencion', seccion: 'Requiere atención', titulo: 'Estado y avisos', tipo: 'avisos', items: [
    { grupo: 'revision', nivel: 'aviso', titulo: 'Contradicción en la memoria del coach', valor: '2',
      detalle: 'Dos datos se contradicen.', accion: 'Mira cuál es el bueno.',
      momento: 'Detectados del 14 oct al 10 nov · el último hace 2 días', resolver: ['abcdef0123456789', '0123456789abcdef'] },
    { grupo: 'espera', nivel: 'info', titulo: 'Bloques de plan en pausa', valor: '4', detalle: 'Cuentas inactivas.' },
    { grupo: 'historial', nivel: 'info', estado: 'obsoleto', titulo: 'Plan con datos dañados', valor: '1',
      detalle: 'Ya no aplica.', resolver: ['1111111111111111'] },
    { grupo: 'historial', nivel: 'info', estado: 'resuelto', titulo: 'Nevera desactualizada en la cola', valor: '1',
      detalle: 'Ya no está pasando.', momento: 'Resuelto el 10 nov · hace 2 días' },
] };
const metricas = () => fetchWithAuth.mock.calls.filter(([url]) => url.startsWith('/api/admin/metricas'));

const montar = (estadoRevisado = 200) => {
    fetchWithAuth.mockImplementation(async (url) => {
        if (url.startsWith('/api/admin/avisos/revisado')) return respuesta({ ok: true, cerradas: 2 }, estadoRevisado);
        if (url.startsWith('/api/admin/yo')) return respuesta({ ok: true });
        return respuesta({ dias: 7, generado: '2026-11-12T17:07:00+00:00', bloques: [ATENCION] });
    });
    return render(
        <MemoryRouter initialEntries={['/admin']}>
            <Routes><Route path="/admin" element={<AdminPage />} /></Routes>
        </MemoryRouter>,
    );
};

describe('[993] Requiere atención', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('sin problemas activos lo dice, y cada grupo explica qué significa', async () => {
        montar();
        expect(await screen.findByText('Sin problemas activos: nada está fallando ahora mismo.')).toBeInTheDocument();
        const revision = screen.getByRole('region', { name: 'Pendientes de revisión (2)' });
        expect(within(revision).getByText('Conviene mirarlo, pero no está rompiendo nada ahora.')).toBeInTheDocument();
        expect(within(revision).getByText('Detectados del 14 oct al 10 nov · el último hace 2 días')).toBeInTheDocument();
    });

    it('lo que ya no aplica se dice, y lo resuelto no lleva botón', async () => {
        montar();
        const obsoleto = (await screen.findByText('Plan con datos dañados')).closest('li');
        expect(obsoleto).toHaveAttribute('data-estado-aviso', 'obsoleto');
        expect(within(obsoleto).getByText('Ya no aplica')).toBeInTheDocument();
        const resuelto = screen.getByText('Nevera desactualizada en la cola').closest('li');
        expect(within(resuelto).queryByRole('button')).toBeNull();
        expect(within(screen.getByText('Bloques de plan en pausa').closest('li')).queryByRole('button')).toBeNull();
    });

    it('marcar como revisado: arma, manda las huellas con la cabecera y recarga', async () => {
        montar();
        const fila = (await screen.findByText('Contradicción en la memoria del coach')).closest('li');
        const boton = within(fila).getByRole('button', { name: 'Marcar como revisado' });
        fireEvent.click(boton);
        expect(boton).toHaveTextContent('¿Seguro? Pulsa otra vez');
        expect(fetchWithAuth.mock.calls.some(([u]) => u.includes('/avisos/revisado'))).toBe(false);
        const antes = metricas().length;
        await act(async () => { fireEvent.click(boton); });
        const llamada = fetchWithAuth.mock.calls.find(([u]) => u.includes('/avisos/revisado'));
        expect(llamada[1].method).toBe('POST');
        expect(llamada[1].headers['X-Admin-Accion']).toBe('1');
        expect(JSON.parse(llamada[1].body)).toEqual({ huellas: ['abcdef0123456789', '0123456789abcdef'] });
        await waitFor(() => expect(metricas().length).toBe(antes + 1));
    });

    it('si falla, lo dice en el botón y no recarga', async () => {
        montar(503);
        const fila = (await screen.findByText('Contradicción en la memoria del coach')).closest('li');
        const boton = within(fila).getByRole('button', { name: 'Marcar como revisado' });
        fireEvent.click(boton);
        const antes = metricas().length;
        await act(async () => { fireEvent.click(boton); });
        expect(await within(fila).findByText('No se pudo marcar. Reintenta.')).toBeInTheDocument();
        expect(metricas().length).toBe(antes);
    });

    it('armado sin confirmar se desarma solo', async () => {
        vi.useFakeTimers();
        try {
            montar();
            await act(async () => { await vi.advanceTimersByTimeAsync(10); });
            const boton = within(screen.getByText('Contradicción en la memoria del coach').closest('li')).getByRole('button');
            fireEvent.click(boton);
            expect(boton).toHaveTextContent('¿Seguro? Pulsa otra vez');
            await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
            expect(boton).toHaveTextContent('Marcar como revisado');
        } finally {
            vi.useRealTimers();
        }
    });
});
