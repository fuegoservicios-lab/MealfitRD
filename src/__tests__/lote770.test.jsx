// frontend/src/__tests__/lote770.test.jsx
// [P1-PLAN-LOTE-770 · 2026-09-28] El dueño: «cuando paso de 7 a 30 parece de repente». Cambiar de periodo borraba la
// página entera y pintaba «Cargando…»; ahora los datos se quedan (atenuados, `aria-busy`) hasta que llegan los nuevos,
// la pastilla del periodo se desliza (`--i`) y un refresco fallido no se lleva lo que ya se veía.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const metricas = (dias, activos) => ({
    dias, generado: '2026-09-28T04:30:00+00:00',
    bloques: [{ id: 'resumen', seccion: 'Resumen', titulo: `Últimos ${dias} días`, tipo: 'resumen',
                tarjetas: [{ etiqueta: 'Usuarios activos', valor: activos, tono: 'neutro' }] }],
});
const montar = () => render(
    <MemoryRouter initialEntries={['/admin']}>
        <Routes><Route path="/admin" element={<AdminPage />} /><Route path="/dashboard" element={<p>DASH</p>} /></Routes>
    </MemoryRouter>,
);

describe('[770] cambiar de periodo es fluido', () => {
    let soltar30;
    beforeEach(() => {
        vi.clearAllMocks();
        fetchWithAuth.mockImplementation((url) => {
            if (url.startsWith('/api/admin/yo')) return Promise.resolve(respuesta({ ok: true }));
            if (url.endsWith('dias=30')) return new Promise((ok) => { soltar30 = () => ok(respuesta(metricas(30, '9'))); });
            return Promise.resolve(respuesta(metricas(7, '2')));
        });
    });

    it('mientras llega el nuevo periodo, lo anterior se queda a la vista (sin «Cargando…»)', async () => {
        montar();
        expect(await screen.findByRole('list', { name: 'Últimos 7 días' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '30 días' }));
        expect(screen.queryByText('Cargando…')).toBeNull();
        expect(screen.getByRole('list', { name: 'Últimos 7 días' })).toBeInTheDocument();
        expect(document.querySelector('[data-contenido]')).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('status')).toHaveTextContent('Actualizando…');
        expect(screen.getByRole('button', { name: 'Actualizar' })).toBeDisabled();
        soltar30();
        expect(await screen.findByRole('list', { name: 'Últimos 30 días' })).toBeInTheDocument();
        expect(document.querySelector('[data-contenido]')).not.toHaveAttribute('aria-busy');
        expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('la pastilla se desliza a la casilla elegida', async () => {
        montar();
        await screen.findByRole('list', { name: 'Últimos 7 días' });
        const grupo = screen.getByRole('group', { name: 'Periodo' });
        expect(grupo.style.getPropertyValue('--i')).toBe('0');
        expect(grupo.querySelector('[data-indicador]')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '90 días' }));
        expect(grupo.style.getPropertyValue('--i')).toBe('2');
        expect(screen.getByRole('button', { name: '90 días' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('un refresco fallido no se lleva los datos que ya se veían', async () => {
        montar();
        await screen.findByRole('list', { name: 'Últimos 7 días' });
        fetchWithAuth.mockImplementation(async (url) => (url.startsWith('/api/admin/yo') ? respuesta({ ok: true }) : respuesta({}, 500)));
        fireEvent.click(screen.getByRole('button', { name: '30 días' }));
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No se pudo actualizar'));
        expect(screen.getByRole('list', { name: 'Últimos 7 días' })).toBeInTheDocument();
        expect(screen.queryByText('No se pudieron cargar las métricas.')).toBeNull();
        expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
    });

    it('sin datos todavía, la primera carga sí dice «Cargando…» y un fallo lo dice en grande', async () => {
        fetchWithAuth.mockImplementation(async (url) => (url.startsWith('/api/admin/yo') ? respuesta({ ok: true }) : respuesta({}, 500)));
        montar();
        expect(screen.getByText('Cargando…')).toBeInTheDocument();
        expect(await screen.findByText('No se pudieron cargar las métricas.')).toBeInTheDocument();
    });

    it('«Volver a la app» es un botón con su flecha que lleva al dashboard', async () => {
        montar();
        await screen.findByRole('list', { name: 'Últimos 7 días' });
        const volver = screen.getByRole('link', { name: 'Volver a la app' });
        expect(volver.querySelector('svg')).not.toBeNull();
        fireEvent.click(volver);
        expect(await screen.findByText('DASH')).toBeInTheDocument();
    });
});
