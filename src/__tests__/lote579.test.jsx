// frontend/src/__tests__/lote579.test.jsx
// [P1-PLAN-LOTE-579 · 2026-09-27] /admin pinta lo que manda el servidor y devuelve al dashboard a quien no es admin.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const METRICAS = {
    dias: 7,
    bloques: [
        { id: 'uso', titulo: 'Uso', tipo: 'kpis', filas: [{ etiqueta: 'Cuentas', valor: '12' }] },
        { id: 'gasto', titulo: 'Gasto de IA (7 días): US$0.28', tipo: 'tabla',
          columnas: ['Función', 'Llamadas', 'Coste'], filas: [['vision_scan', '14', 'US$0.03']] },
        { id: 'planes', titulo: 'Planes', tipo: 'error', error: 'No disponible' },
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

describe('[579] /admin', () => {
    beforeEach(() => vi.clearAllMocks());

    it('pinta los bloques tal como los manda el servidor', async () => {
        fetchWithAuth.mockImplementation(async (url) => respuesta(url.startsWith('/api/admin/yo') ? { ok: true } : METRICAS));
        montar();
        expect(await screen.findByText('Cuentas')).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('vision_scan')).toBeInTheDocument();
        expect(screen.getByText('No disponible')).toBeInTheDocument();
        expect(fetchWithAuth).toHaveBeenCalledWith('/api/admin/metricas?dias=7');
        expect(fetchWithAuth).toHaveBeenCalledWith('/api/admin/yo');
    });

    it('cambiar el periodo vuelve a pedir con esos días', async () => {
        fetchWithAuth.mockImplementation(async () => respuesta(METRICAS));
        montar();
        await screen.findByText('Cuentas');
        fireEvent.click(screen.getByRole('button', { name: '30 días' }));
        await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledWith('/api/admin/metricas?dias=30'));
    });

    it('a quien no es admin lo devuelve al dashboard', async () => {
        fetchWithAuth.mockImplementation(async () => respuesta({ detail: 'Not Found' }, 404));
        montar();
        expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    });

    it('la ruta existe solo en web y con sesión', () => {
        const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
        expect(app).toContain("const AdminPage = lazy(() => import('./pages/AdminPage'));");
        expect(app).toMatch(/<Route path="\/admin" element=\{\s*NATIVE_NO_COMMERCE\s*\? <Navigate to="\/dashboard" replace \/>\s*: <ProtectedRoute><AdminPage \/><\/ProtectedRoute>\s*\} \/>/);
    });
});
