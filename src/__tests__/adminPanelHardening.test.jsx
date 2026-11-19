// frontend/src/__tests__/adminPanelHardening.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';
import { cifra, generarRequestId, usd } from '../utils/adminCuentas';

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const montar = () => render(
    <MemoryRouter initialEntries={['/admin']}>
        <Routes>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/dashboard" element={<p>DASHBOARD</p>} />
        </Routes>
    </MemoryRouter>,
);

describe('Endurecimiento e interactividad del panel de administración', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        localStorage.clear();
    });

    it('usd() y cifra() rechazan booleanos y formatean negativos correctamente', () => {
        expect(usd(true)).toBe('US$0.00');
        expect(usd(false)).toBe('US$0.00');
        expect(usd(-0.5)).toBe('-US$0.50');
        expect(cifra(true)).toBe('—');
        expect(cifra(false)).toBe('—');
        expect(generarRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('redirige a /dashboard a un no-admin incluso si sessionStorage restauró la pestaña Cuentas', async () => {
        localStorage.setItem('mealfit_user_id', 'user-no-admin');
        sessionStorage.setItem('mf:admin-navigation:v1:user-no-admin:vista', JSON.stringify('cuentas'));
        fetchWithAuth.mockImplementation(async () => respuesta({ detail: 'Not Found' }, 404));
        montar();
        expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    });

    it('soporta navegación por teclado (ArrowRight/ArrowLeft) en las pestañas principales y actualiza el subtítulo', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.startsWith('/api/admin/yo')) return respuesta({ ok: true });
            if (url.startsWith('/api/admin/metricas')) return respuesta({
                dias: 7, generado: '2026-11-19T15:00:00Z',
                bloques: [{ id: 'r', seccion: 'Resumen', titulo: 'Últimos 7 días', tipo: 'resumen', tarjetas: [] }],
            });
            return respuesta({}, 404);
        });
        montar();
        const tabMetricas = await screen.findByRole('tab', { name: 'Métricas' });
        await screen.findByText(/Actualización automática cada 30 s/);
        fireEvent.keyDown(tabMetricas, { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Cuentas' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByText(/Actualización automática cada 30 s/)).toBeNull();
        expect(screen.getByText(/Gestión de cuentas/)).toBeInTheDocument();
    });

    it('la minigráfica y las barras de serie muestran lectura interactiva al pasar el cursor y evitan rótulos pegados', async () => {
        const serie10 = Array.from({ length: 10 }, (_, i) => ({ etiqueta: `${i + 1} nov`, valor: i + 1, texto: String(i + 1) }));
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.startsWith('/api/admin/yo')) return respuesta({ ok: true });
            if (url.startsWith('/api/admin/metricas')) return respuesta({
                dias: 7, generado: '2026-11-19T15:00:00Z',
                bloques: [
                    {
                        id: 'resumen', seccion: 'Resumen', titulo: 'Últimos 7 días', tipo: 'resumen',
                        tarjetas: [{ etiqueta: 'Usuarios activos', valor: '10', tono: 'neutro', serie: serie10.slice(0, 3), serie_titulo: 'Por día' }],
                    },
                    { id: 's1', seccion: 'Usuarios', titulo: 'Activos por día', tipo: 'serie', puntos: serie10 },
                ],
            });
            return respuesta({}, 404);
        });
        montar();
        const mini = await screen.findByRole('img', { name: /Por día/ });
        fireEvent.mouseEnter(mini.querySelectorAll('span')[0]);
        expect(screen.getByText('1 nov: 1')).toBeInTheDocument();

        // Serie de 10 barras: los rótulos 9 nov y 10 nov no colisionan (solo queda 10 nov al final)
        const seccionSerie = screen.getByText('Activos por día').closest('section');
        const lista = within(seccionSerie).getByRole('list');
        const cols = within(lista).getAllByRole('listitem');
        expect(cols[8].textContent).not.toContain('9 nov');
        expect(cols[9].textContent).toContain('10 nov');
        fireEvent.mouseEnter(cols[4]);
        expect(cols[4]).toHaveAttribute('data-activa', 'true');
    });

    it('BotonRevisado mantiene clave estable cuando cambia el orden de los avisos al refrescar', async () => {
        let ronda = 1;
        const alertaA = { grupo: 'activo', nivel: 'critico', titulo: 'Alerta A', valor: '1', resolver: ['aaaaaaaaaaaaaaaa'] };
        const alertaB = { grupo: 'activo', nivel: 'aviso', titulo: 'Alerta B', valor: '2', resolver: ['bbbbbbbbbbbbbbbb'] };
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.startsWith('/api/admin/yo')) return respuesta({ ok: true });
            if (url.startsWith('/api/admin/metricas')) {
                return respuesta({
                    dias: 7, generado: '2026-11-19T15:00:00Z',
                    bloques: [{ id: 'at', seccion: 'Requiere atención', titulo: 'Avisos', tipo: 'avisos', items: ronda === 1 ? [alertaA, alertaB] : [alertaB] }],
                });
            }
            return respuesta({}, 404);
        });
        montar();
        const filaA = (await screen.findByText('Alerta A')).closest('li');
        fireEvent.click(within(filaA).getByRole('button', { name: 'Marcar como revisado' }));
        expect(within(filaA).getByRole('button', { name: '¿Seguro? Pulsa otra vez' })).toBeInTheDocument();

        // Refresco en el que Alerta A desaparece y Alerta B pasa al índice 0: Alerta B NO debe quedar armada
        ronda = 2;
        fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
        await waitFor(() => expect(screen.queryByText('Alerta A')).toBeNull());
        const filaB = screen.getByText('Alerta B').closest('li');
        expect(within(filaB).getByRole('button', { name: 'Marcar como revisado' })).toBeInTheDocument();
    });

    it('la leyenda de Ajustes de la gente permite fijar resaltado cruzado al hacer clic', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.startsWith('/api/admin/yo')) return respuesta({ ok: true });
            if (url.startsWith('/api/admin/metricas')) return respuesta({
                dias: 7, generado: '2026-11-19T15:00:00Z',
                bloques: [{ id: 'r', seccion: 'Resumen', titulo: 'Últimos 7 días', tipo: 'resumen', tarjetas: [] }],
            });
            if (url.startsWith('/api/admin/ajustes/resumen')) return respuesta({
                cuentas: 10, dias: 7,
                ajustes: [{ clave: 'water', grupo: 'Seguimiento', etiqueta: 'Hidratación', conteo: { encendido: 6, apagado: 4 } }],
                cambios: [], dispositivo: {},
            });
            return respuesta({}, 404);
        });
        montar();
        const bloque = await screen.findByRole('region', { name: 'Ajustes de la gente' });
        const btnApagado = within(bloque).getByRole('button', { name: 'Apagado' });
        fireEvent.click(btnApagado);
        expect(btnApagado).toHaveAttribute('aria-pressed', 'true');
        const barra = bloque.querySelector('[data-barra]');
        expect(barra).toHaveAttribute('data-foco', 'apagado');
        expect(barra.querySelector('[data-segmento="apagado"]')).toHaveAttribute('data-resaltado', 'true');
    });
});
