import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ListaImagenPreview from '../components/dashboard/ListaImagenPreview';
import { compartirPaginasLista } from '../utils/listaComoImagen';
vi.mock('../utils/listaComoImagen', () => ({ compartirPaginasLista: vi.fn(async () => 'cancelado'), puedeCompartirLista: () => true, descargarPaginaLista: vi.fn() }));

beforeEach(() => {
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:pagina-${++n}`);
    URL.revokeObjectURL = vi.fn();
    compartirPaginasLista.mockClear();
});
afterEach(cleanup);
const imagenes = [1, 2].map((n) => ({ blob: new Blob([String(n)], { type: 'image/png' }), nombre: `lista-${n}.png` }));

describe('vista de páginas de compras', () => {
    it('comparte la lista completa desde un toque y conserva la página cuando se cancela', async () => {
        const cerrar = vi.fn();
        render(<ListaImagenPreview imagenes={imagenes} onClose={cerrar} />);
        expect(screen.getByRole('button', { name: 'Imagen anterior' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Imagen siguiente' }));
        expect(screen.getByRole('img')).toHaveAttribute('alt', 'Lista de compras 2 / 2');
        fireEvent.click(screen.getByRole('button', { name: 'Compartir lista completa' }));
        expect(compartirPaginasLista).toHaveBeenCalledWith(imagenes);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Compartir lista completa' })).not.toBeDisabled());
        expect(cerrar).not.toHaveBeenCalled();
        expect(screen.getByRole('img')).toHaveAttribute('alt', 'Lista de compras 2 / 2');
    });
    it('permite deslizar horizontalmente sin convertir el desplazamiento vertical en cambio de página', () => {
        render(<ListaImagenPreview imagenes={imagenes} onClose={() => {}} />);
        const zona = screen.getByRole('img').parentElement;
        fireEvent.touchStart(zona, { touches: [{ clientX: 240, clientY: 120 }] });
        fireEvent.touchEnd(zona, { changedTouches: [{ clientX: 20, clientY: 126 }] });
        expect(screen.getByRole('img')).toHaveAttribute('alt', 'Lista de compras 2 / 2');
        fireEvent.touchStart(zona, { touches: [{ clientX: 20, clientY: 280 }] });
        fireEvent.touchEnd(zona, { changedTouches: [{ clientX: 60, clientY: 80 }] });
        expect(screen.getByRole('img')).toHaveAttribute('alt', 'Lista de compras 2 / 2');
    });
    it('cierra con Escape y libera las URLs al desmontar', async () => {
        const cerrar = vi.fn();
        const vista = render(<ListaImagenPreview imagenes={imagenes} onClose={cerrar} />);
        await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(cerrar).toHaveBeenCalledTimes(1);
        vista.unmount();
        expect(URL.revokeObjectURL.mock.calls.flat()).toEqual(['blob:pagina-1', 'blob:pagina-2']);
    });
});
