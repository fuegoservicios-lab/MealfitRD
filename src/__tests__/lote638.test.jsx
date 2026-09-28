// frontend/src/__tests__/lote638.test.jsx
// [P1-PLAN-LOTE-638 · 2026-09-28] /admin se entiende. El dueño: «se ve feo y poco entendible». El pintor abre un título
// por `seccion`, pinta la franja `resumen` (cifra + cambio con su tono + qué significa), los `avisos` con su gravedad
// dicha en palabra (no solo en color), las `serie` de barras y el `embudo`. Sigue siendo genérico: lo que pinta lo
// decide el servidor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';

const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const METRICAS = {
    dias: 7,
    generado: '2026-09-28T02:35:00+00:00',
    bloques: [
        { id: 'resumen', seccion: 'Resumen', titulo: 'Últimos 7 días', tipo: 'resumen', tarjetas: [
            { etiqueta: 'Usuarios activos', valor: '2', cambio: 'Igual que los 7 días anteriores', tono: 'neutro',
              ayuda: 'Sin tus cuentas.' },
            { etiqueta: 'Cuentas nuevas', valor: '5', cambio: '↑ 2 frente a los 7 días anteriores (3)', tono: 'bueno' },
            { etiqueta: 'Estado del sistema', valor: '5 avisos', tono: 'aviso', ayuda: '6 notas informativas.' },
        ] },
        { id: 'atencion', seccion: 'Requiere atención', titulo: 'Avisos abiertos', tipo: 'avisos', vacio: 'Nada pendiente.',
          items: [
              { nivel: 'critico', titulo: 'Una tarea programada falló', valor: '1', detalle: 'Un proceso dio error.' },
              { nivel: 'info', titulo: 'Bloque de plan aplazado', valor: '3', detalle: 'Informativo.' },
              { nivel: '<script>', titulo: 'Nivel raro', valor: '1' },
          ] },
        { id: 'activos_dia', seccion: 'Usuarios', titulo: 'Usuarios activos por día', tipo: 'serie', puntos: [
            { etiqueta: '26 sep', valor: 2, texto: '2' }, { etiqueta: '27 sep', valor: 0, texto: '0' },
            { etiqueta: '28 sep', valor: 1, texto: '1' },
        ] },
        { id: 'embudo', seccion: 'Usuarios', titulo: 'Qué hicieron las cuentas nuevas', tipo: 'embudo', pasos: [
            { etiqueta: 'Se registraron', valor: '5', pct: 1, texto: '100 %' },
            { etiqueta: 'Registraron una comida', valor: '2', pct: 0.4, texto: '40 %' },
        ] },
        { id: 'coach', seccion: 'Producto', titulo: 'Coach', tipo: 'kpis', filas: [
            { etiqueta: 'Valoraciones', valor: 'Ninguna todavía', ayuda: 'Nadie ha marcado 👍 o 👎.' },
        ] },
    ],
};
const montar = () => render(
    <MemoryRouter initialEntries={['/admin']}>
        <Routes><Route path="/admin" element={<AdminPage />} /></Routes>
    </MemoryRouter>,
);

describe('[638] /admin por secciones', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchWithAuth.mockImplementation(async (url) => respuesta(url.startsWith('/api/admin/yo') ? { ok: true } : METRICAS));
    });

    it('una sección por nombre, en el orden en que llegan', async () => {
        montar();
        await screen.findByText('Usuarios activos');
        const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
        expect(titulos).toEqual(['Resumen', 'Requiere atención', 'Usuarios', 'Producto']);
        const usuarios = document.querySelector('[data-seccion="Usuarios"]');
        expect(within(usuarios).getByText('Usuarios activos por día')).toBeInTheDocument();
        expect(within(usuarios).getByText('Qué hicieron las cuentas nuevas')).toBeInTheDocument();
    });

    it('el resumen dice la cifra, el cambio con su tono y qué significa', async () => {
        montar();
        const franja = await screen.findByRole('list', { name: 'Últimos 7 días' });
        const nuevas = within(franja).getByText('Cuentas nuevas').closest('li');
        expect(within(nuevas).getByText('5')).toBeInTheDocument();
        expect(within(nuevas).getByText('↑ 2 frente a los 7 días anteriores (3)')).toBeInTheDocument();
        expect(nuevas).toHaveAttribute('data-tono', 'bueno');
        const estado = within(franja).getByText('Estado del sistema').closest('li');
        expect(estado).toHaveAttribute('data-tono', 'aviso');
        expect(within(estado).getByText('6 notas informativas.')).toBeInTheDocument();
    });

    it('cada aviso dice su gravedad en palabra; un nivel desconocido cae a informativo', async () => {
        montar();
        const critico = (await screen.findByText('Una tarea programada falló')).closest('li');
        expect(critico).toHaveAttribute('data-nivel-aviso', 'critico');
        expect(within(critico).getByText('Crítico')).toBeInTheDocument();
        expect(within(critico).getByText('Un proceso dio error.')).toBeInTheDocument();
        expect(screen.getByText('Nivel raro').closest('li')).toHaveAttribute('data-nivel-aviso', 'info');
    });

    it('sin avisos, lo dice', async () => {
        fetchWithAuth.mockImplementation(async (url) => respuesta(url.startsWith('/api/admin/yo') ? { ok: true } : {
            ...METRICAS, bloques: [{ id: 'atencion', seccion: 'Requiere atención', titulo: 'Avisos abiertos',
                                     tipo: 'avisos', items: [], vacio: 'Nada pendiente.' }] }));
        montar();
        expect(await screen.findByText('Nada pendiente.')).toBeInTheDocument();
    });

    it('la serie escala las barras al máximo y marca el cero', async () => {
        montar();
        await screen.findByText('Usuarios activos por día');
        const barras = document.querySelectorAll('[data-serie-barra]');
        expect([...barras].map((b) => b.style.height)).toEqual(['100%', '0%', '50%']);
        expect(screen.getByRole('listitem', { name: '27 sep: 0' })).toBeInTheDocument();
    });

    it('el embudo dibuja cada paso sobre el total', async () => {
        montar();
        await screen.findByText('Se registraron');
        const pasos = document.querySelectorAll('[data-paso-barra]');
        expect([...pasos].map((b) => b.style.width)).toEqual(['100%', '40%']);
        expect(screen.getByText('40 %')).toBeInTheDocument();
    });

    it('una fila puede explicar qué significa', async () => {
        montar();
        expect(await screen.findByText('Nadie ha marcado 👍 o 👎.')).toBeInTheDocument();
        expect(screen.getByText('Ninguna todavía')).toBeInTheDocument();
    });

    it('un bloque de cifras ancho pasa al final de su sección; la gráfica no se mueve', async () => {
        const muchas = Array.from({ length: 9 }, (_, i) => ({ etiqueta: `Fila ${i}`, valor: String(i + 1) }));
        fetchWithAuth.mockImplementation(async (url) => respuesta(url.startsWith('/api/admin/yo') ? { ok: true } : {
            ...METRICAS, bloques: [
                { id: 's', seccion: 'Producto', titulo: 'Serie', tipo: 'serie', puntos: [{ etiqueta: 'a', valor: 1, texto: '1' }] },
                { id: 'a', seccion: 'Producto', titulo: 'Coach', tipo: 'kpis', filas: [{ etiqueta: 'x', valor: '1' }] },
                { id: 'b', seccion: 'Producto', titulo: 'Planes', tipo: 'kpis', filas: muchas },
                { id: 'c', seccion: 'Producto', titulo: 'Escáner', tipo: 'kpis', filas: [{ etiqueta: 'y', valor: '2' }] },
            ] }));
        montar();
        await screen.findByText('Planes');
        expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Serie', 'Coach', 'Escáner', 'Planes']);
    });

    it('el periodo activo se anuncia como pulsado', async () => {
        montar();
        await screen.findByText('Usuarios activos');
        expect(screen.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'false');
    });
});
